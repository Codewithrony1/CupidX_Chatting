require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'cupidx_fallback_jwt_secret';
const PORT = process.env.SOCKET_PORT || 3001;
const CLIENT_URL = process.env.NEXT_PUBLIC_CLIENT_URL || 'http://localhost:3000';

const fs = require('fs');
const os = require('os');
const defaultDbPath = path.join(__dirname, '..', 'prisma', 'dev.db');
let dbPath = defaultDbPath;

if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const tmpPath = path.join(os.tmpdir(), 'dev.db');
  try {
    if (!fs.existsSync(tmpPath)) {
      if (fs.existsSync(defaultDbPath)) {
        fs.copyFileSync(defaultDbPath, tmpPath);
      } else {
        fs.writeFileSync(tmpPath, '');
      }
    }
    dbPath = tmpPath;
  } catch (e) {
    console.warn('Failed to copy SQLite database in socket server:', e);
  }
}

const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('CupidX Omegle Random Chat Socket.IO Server is running.\n');
});

const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// User socket map: userId -> socketId
const userSockets = new Map();
// Active random chat pairings: socketId -> partnerSocketId
const activeRandomChats = new Map();
// In-memory random matching queue array of candidate objects:
// { socketId, userId, username, fullName, avatarUrl, gender, preferredGender, language, isVIP, joinTime }
let randomMatchQueue = [];

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return next(new Error('Invalid token'));
      }
      socket.user = decoded; // { userId, username, role }
      next();
    });
  } catch (error) {
    next(new Error('Internal Authentication Error'));
  }
});

// Mood Compatibility Map
const MOOD_COMPATIBILITY = {
  romantic: ['romantic', 'flirty', 'deep'],
  flirty: ['flirty', 'romantic', 'funny'],
  friendly: ['friendly', 'chill', 'funny'],
  chill: ['chill', 'friendly', 'deep', 'music'],
  deep: ['deep', 'romantic', 'chill'],
  funny: ['funny', 'friendly', 'flirty'],
};

function areMoodsCompatible(moodA, moodB) {
  if (!moodA || !moodB) return true;
  const mA = moodA.toLowerCase();
  const mB = moodB.toLowerCase();
  if (mA === mB) return true;
  const list = MOOD_COMPATIBILITY[mA];
  return Boolean(list && list.includes(mB));
}

// Calculate pairwise compatibility and smart matching score
async function calculateMatchScore(candidateA, candidateB, now) {
  if (candidateA.userId === candidateB.userId) {
    return { canMatch: false, score: -1 };
  }

  // 1. Abuse prevention: Block & VIP Ban check (Never re-suggest banned pairings)
  try {
    const blockRelation = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: candidateA.userId, blockedId: candidateB.userId },
          { blockerId: candidateB.userId, blockedId: candidateA.userId },
        ],
      },
    });
    if (blockRelation) return { canMatch: false, score: -1 };

    const banRelation = await prisma.userBan.findFirst({
      where: {
        OR: [
          { bannedByUserId: candidateA.userId, bannedUserId: candidateB.userId },
          { bannedByUserId: candidateB.userId, bannedUserId: candidateA.userId },
        ],
      },
    });
    if (banRelation) return { canMatch: false, score: -1 };
  } catch (e) {
    console.error('Error checking block/ban in socket matching:', e);
  }

  let score = 0;
  const waitTimeA = now - candidateA.joinTime;
  const waitTimeB = now - candidateB.joinTime;

  // 2. Gender Preference Scoring & Strict 8s / Fallback Logic
  const prefA = candidateA.isVIP ? (candidateA.genderPref || 'auto') : 'auto';
  const prefB = candidateB.isVIP ? (candidateB.genderPref || 'auto') : 'auto';

  // Candidate A preference check
  if (candidateA.isVIP && prefA !== 'auto' && prefA !== 'any') {
    const isGenderMatch = prefA.toLowerCase() === (candidateB.gender || '').toLowerCase();
    if (isGenderMatch) {
      score += 3;
    } else if (waitTimeA < 8000) {
      // Under 8 seconds, VIP waits strictly for preferred gender
      return { canMatch: false, score: -1 };
    }
    // After 8s: Fall back to random match without gender bonus
  }

  // Candidate B preference check
  if (candidateB.isVIP && prefB !== 'auto' && prefB !== 'any') {
    const isGenderMatch = prefB.toLowerCase() === (candidateA.gender || '').toLowerCase();
    if (isGenderMatch) {
      score += 3;
    } else if (waitTimeB < 8000) {
      return { canMatch: false, score: -1 };
    }
  }

  // 3. Shared Personality Tags (+2 per shared tag)
  const tagsA = candidateA.tags || [];
  const tagsB = candidateB.tags || [];
  const sharedTags = tagsA.filter((t) => tagsB.includes(t));
  score += sharedTags.length * 2;

  // 4. Mood Compatibility (+1 if compatible)
  if (areMoodsCompatible(candidateA.mood, candidateB.mood)) {
    score += 1;
  }

  // 5. VIP Priority Bonus
  if (candidateA.isVIP || candidateB.isVIP) {
    score += 1;
  }

  // 6. Tie-breaker: Longer wait time gets slight score boost
  const longestWaitSeconds = Math.max(waitTimeA, waitTimeB) / 1000;
  score += longestWaitSeconds * 0.01;

  return { canMatch: true, score };
}

// Function to process queue matching with Smart Priority Scoring
async function processMatchQueue() {
  if (randomMatchQueue.length < 2) return;

  const now = Date.now();
  let bestPair = null;
  let highestScore = -1;

  for (let i = 0; i < randomMatchQueue.length; i++) {
    const candidateA = randomMatchQueue[i];
    for (let j = i + 1; j < randomMatchQueue.length; j++) {
      const candidateB = randomMatchQueue[j];

      const { canMatch, score } = await calculateMatchScore(candidateA, candidateB, now);
      if (canMatch && score > highestScore) {
        highestScore = score;
        bestPair = [candidateA, candidateB];
      }
    }
  }

  if (bestPair) {
    const [candidateA, candidateB] = bestPair;

    // Remove both from queue
    randomMatchQueue = randomMatchQueue.filter(
      (c) => c.socketId !== candidateA.socketId && c.socketId !== candidateB.socketId
    );

    // Record pair in active random chats map
    activeRandomChats.set(candidateA.socketId, candidateB.socketId);
    activeRandomChats.set(candidateB.socketId, candidateA.socketId);

    const roomId = `room_${candidateA.socketId}_${candidateB.socketId}`;

    const socketA = io.sockets.sockets.get(candidateA.socketId);
    const socketB = io.sockets.sockets.get(candidateB.socketId);

    if (socketA) socketA.join(roomId);
    if (socketB) socketB.join(roomId);

    // Notify User A
    io.to(candidateA.socketId).emit('random_match_found', {
      roomId,
      partner: {
        id: candidateB.userId,
        username: candidateB.username,
        fullName: candidateB.fullName,
        avatarUrl: candidateB.avatarUrl,
        gender: candidateB.gender,
        isVIP: candidateB.isVIP,
      },
    });

    // Notify User B
    io.to(candidateB.socketId).emit('random_match_found', {
      roomId,
      partner: {
        id: candidateA.userId,
        username: candidateA.username,
        fullName: candidateA.fullName,
        avatarUrl: candidateA.avatarUrl,
        gender: candidateA.gender,
        isVIP: candidateA.isVIP,
      },
    });

    console.log(`[SMART MATCH] Matched @${candidateA.username} (${candidateA.plan}) with @${candidateB.username} (${candidateB.plan}) [Score: ${highestScore.toFixed(2)}] in ${roomId}`);
  }
}

io.on('connection', async (socket) => {
  const { userId, username } = socket.user;
  userSockets.set(userId, socket.id);

  // Update profile online status
  try {
    await prisma.profile.update({
      where: { userId },
      data: { isOnline: true, lastSeen: new Date() }
    });
  } catch (e) {}

  // 1. Join Random Chat Queue with smart preferences
  socket.on('join_random_queue', async (preferences = {}) => {
    // Remove if already in queue
    randomMatchQueue = randomMatchQueue.filter((c) => c.socketId !== socket.id);

    const userDb = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, subscription: true },
    });

    const isVIP = userDb?.is_vip || userDb?.membershipTier === 'VIP' || (userDb?.subscription?.isActive === true && userDb?.subscription?.plan === 'VIP');
    const userInterests = userDb?.profile?.interests ? userDb.profile.interests.split(',').map((s) => s.trim().toLowerCase()) : [];

    const candidate = {
      socketId: socket.id,
      userId,
      username,
      fullName: userDb?.fullName || username,
      avatarUrl: userDb?.profile?.avatarUrl || '/default-avatar.png',
      gender: preferences.gender || userDb?.profile?.gender || 'unspecified',
      genderPref: preferences.preferredGender || preferences.genderPref || userDb?.profile?.preferredGender || 'auto',
      mood: preferences.mood || userDb?.profile?.mood || 'chill',
      tags: preferences.tags && Array.isArray(preferences.tags) ? preferences.tags : userInterests,
      language: preferences.language || userDb?.profile?.language || 'english',
      plan: isVIP ? 'vip' : 'free',
      isVIP,
      joinTime: Date.now(),
    };

    randomMatchQueue.push(candidate);
    socket.emit('queue_joined', { status: 'searching', isVIP, plan: candidate.plan });

    // Process matching immediately
    processMatchQueue();
  });

  // 2. Leave Queue
  socket.on('leave_random_queue', () => {
    randomMatchQueue = randomMatchQueue.filter((c) => c.socketId !== socket.id);
    socket.emit('queue_left');
  });

  // 3. Send Random Chat Message
  socket.on('send_random_message', async (data, callback) => {
    const partnerSocketId = activeRandomChats.get(socket.id);
    if (!partnerSocketId) {
      if (callback) callback({ error: 'No active chat partner connected.' });
      return;
    }

    const { content, imageUrl } = data;
    if (!content && !imageUrl) return;

    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId: userId,
      senderUsername: username,
      content: content || '',
      imageUrl: imageUrl || null,
      createdAt: new Date().toISOString()
    };

    // Forward to partner socket
    io.to(partnerSocketId).emit('receive_random_message', messageObj);
    // Reflect back to sender
    socket.emit('receive_random_message', messageObj);

    if (callback) callback({ success: true, message: messageObj });
  });

  // 4. Random Typing Status
  socket.on('random_typing_status', ({ isTyping }) => {
    const partnerSocketId = activeRandomChats.get(socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partner_typing_status', { isTyping });
    }
  });

  // 5. Next Partner (Skip & Re-queue)
  socket.on('next_partner', async (preferences = {}) => {
    const partnerSocketId = activeRandomChats.get(socket.id);

    if (partnerSocketId) {
      // Notify partner that they were skipped
      io.to(partnerSocketId).emit('partner_left', { reason: 'partner_skipped' });
      activeRandomChats.delete(partnerSocketId);
    }
    activeRandomChats.delete(socket.id);

    // Automatically join queue again for immediate next match
    randomMatchQueue = randomMatchQueue.filter((c) => c.socketId !== socket.id);

    const userDb = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, subscription: true }
    });

    const isVIP = userDb?.membershipTier === 'VIP' || (userDb?.subscription?.isActive === true && userDb?.subscription?.plan === 'VIP');

    const candidate = {
      socketId: socket.id,
      userId,
      username,
      fullName: userDb?.fullName || username,
      avatarUrl: userDb?.profile?.avatarUrl || '/default-avatar.png',
      gender: preferences.gender || userDb?.profile?.gender || 'unspecified',
      preferredGender: preferences.preferredGender || userDb?.profile?.preferredGender || 'any',
      language: preferences.language || userDb?.profile?.language || 'english',
      isVIP,
      joinTime: Date.now()
    };

    randomMatchQueue.push(candidate);
    socket.emit('queue_joined', { status: 'searching', isVIP });

    processMatchQueue();
  });

  // 6. End Random Chat
  socket.on('end_random_chat', () => {
    const partnerSocketId = activeRandomChats.get(socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partner_left', { reason: 'chat_ended' });
      activeRandomChats.delete(partnerSocketId);
    }
    activeRandomChats.delete(socket.id);
    randomMatchQueue = randomMatchQueue.filter((c) => c.socketId !== socket.id);
    socket.emit('chat_ended_confirm');
  });

  // Disconnect handler
  socket.on('disconnect', async () => {
    userSockets.delete(userId);

    // Remove from random queue
    randomMatchQueue = randomMatchQueue.filter((c) => c.socketId !== socket.id);

    // Notify active partner if disconnected during chat
    const partnerSocketId = activeRandomChats.get(socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partner_left', { reason: 'disconnected' });
      activeRandomChats.delete(partnerSocketId);
    }
    activeRandomChats.delete(socket.id);

    // Update database offline status
    try {
      await prisma.profile.update({
        where: { userId },
        data: { isOnline: false, lastSeen: new Date() }
      });
      io.emit('user_status_changed', { userId, username, isOnline: false });
    } catch (e) {}
  });
});

// Expose queue stats for admin analytics
global.getQueueStats = () => ({
  queueLength: randomMatchQueue.length,
  activeRandomChatsCount: activeRandomChats.size / 2
});

server.listen(PORT, () => {
  console.log(`CupidX Omegle Socket.IO Server running on port ${PORT}`);
});
