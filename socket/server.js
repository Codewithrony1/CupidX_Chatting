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

if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === 'production') {
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

// Helper function to check if two users can be matched based on preferences & blocks
async function canUsersMatch(candidateA, candidateB) {
  if (candidateA.userId === candidateB.userId) return false;

  // Enforce VIP restriction: non-VIP users are forced to 'auto' mode
  const prefA = candidateA.isVIP ? (candidateA.preferredGender || 'auto') : 'auto';
  const prefB = candidateB.isVIP ? (candidateB.preferredGender || 'auto') : 'auto';

  // Specific gender filter check (VIP only)
  if (prefA !== 'auto' && prefA !== 'any' && prefA !== candidateB.gender) {
    return false;
  }
  if (prefB !== 'auto' && prefB !== 'any' && prefB !== candidateA.gender) {
    return false;
  }

  // Auto matching ratio logic:
  // Non-VIP Auto: 70% chance Male target, 30% Female/Non-Binary target
  // VIP Auto: 40% chance Male target, 60% Female/Non-Binary target
  if (prefA === 'auto') {
    const isMaleTarget = Math.random() < (candidateA.isVIP ? 0.40 : 0.70);
    const targetGender = isMaleTarget ? 'male' : 'female';
    if (candidateB.gender !== 'unspecified' && candidateB.gender !== targetGender && candidateB.gender !== 'nonbinary') {
      // Allow match if candidate pool is small, but favor probability
      if (Math.random() < 0.65) return false;
    }
  }

  if (prefB === 'auto') {
    const isMaleTarget = Math.random() < (candidateB.isVIP ? 0.40 : 0.70);
    const targetGender = isMaleTarget ? 'male' : 'female';
    if (candidateA.gender !== 'unspecified' && candidateA.gender !== targetGender && candidateA.gender !== 'nonbinary') {
      if (Math.random() < 0.65) return false;
    }
  }

  // Language check if specified
  if (candidateA.language !== 'any' && candidateB.language !== 'any' && candidateA.language !== candidateB.language) {
    return false;
  }

  // Block & Personal VIP Ban checks
  try {
    const blockRelation = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: candidateA.userId, blockedId: candidateB.userId },
          { blockerId: candidateB.userId, blockedId: candidateA.userId }
        ]
      }
    });
    if (blockRelation) return false;

    const banRelation = await prisma.userBan.findFirst({
      where: {
        OR: [
          { bannedByUserId: candidateA.userId, bannedUserId: candidateB.userId },
          { bannedByUserId: candidateB.userId, bannedUserId: candidateA.userId }
        ]
      }
    });
    if (banRelation) return false;
  } catch (e) {
    console.error('Error checking block/ban relation during match:', e);
  }

  return true;
}

// Function to process queue matching
async function processMatchQueue() {
  if (randomMatchQueue.length < 2) return;

  // Sort queue so VIP users get priority matching at the top
  randomMatchQueue.sort((a, b) => {
    if (a.isVIP && !b.isVIP) return -1;
    if (!a.isVIP && b.isVIP) return 1;
    return a.joinTime - b.joinTime;
  });

  for (let i = 0; i < randomMatchQueue.length; i++) {
    const candidateA = randomMatchQueue[i];
    for (let j = i + 1; j < randomMatchQueue.length; j++) {
      const candidateB = randomMatchQueue[j];

      const matched = await canUsersMatch(candidateA, candidateB);
      if (matched) {
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
          }
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
          }
        });

        console.log(`Matched @${candidateA.username} with @${candidateB.username} in ${roomId}`);
        return;
      }
    }
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
    io.emit('user_status_changed', { userId, username, isOnline: true });
  } catch (e) {}

  // 1. Join Random Match Queue
  socket.on('join_random_queue', async (preferences = {}) => {
    // Remove if already in queue
    randomMatchQueue = randomMatchQueue.filter((c) => c.socketId !== socket.id);

    // Fetch user profile & subscription
    const userDb = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, subscription: true }
    });

    const isVIP = userDb?.subscription?.isActive || false;

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

    const isVIP = userDb?.subscription?.isActive || false;

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
