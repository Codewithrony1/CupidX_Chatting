require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const JWT_SECRET = process.env.JWT_SECRET || 'cupidx_jwt_ultra_secret_key_2026_change_in_production';
const PORT = process.env.SOCKET_PORT || 3001;
const CLIENT_URL = process.env.NEXT_PUBLIC_CLIENT_URL || 'http://localhost:3000';

// Database setup with SQLite WAL mode and busy timeout
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

try {
  const sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('busy_timeout = 5000');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.close();
} catch (e) {
  console.warn('Could not set WAL pragma on SQLite:', e.message);
}

const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

// ── In-Memory Realtime Architecture ──────────────────────────────────────────
// userSockets: userId -> Set<socketId>
const userSockets = new Map();
// socketToUser: socketId -> { userId, username, fullName, avatarUrl, isVIP, plan, gender, preferredGender }
const socketToUser = new Map();
// activeMatches: matchId -> { matchId, roomId, userA, userB, createdAt }
const activeMatches = new Map();
// userActiveMatch: userId -> matchId
const userActiveMatch = new Map();
// reconnectGraceTimers: userId -> timeoutId (10-second grace period for transport reconnect)
const reconnectGraceTimers = new Map();
// recentPartners: userId -> Set<partnerUserId> (prevent immediate rematching upon skip)
const recentPartners = new Map();
// In-memory candidate queue
let randomMatchQueue = [];
// User profile cache (TTL 60 seconds) to avoid database hits in tight loops
const userCache = new Map();
// Blocked users cache (TTL 30 seconds) to prevent blocked pairs from chatting/matching
const blockedUsersCache = new Map();
const blocksCacheTimestamps = new Map();
const BLOCKS_CACHE_TTL_MS = 30 * 1000;

async function getCachedBlockedUsers(uid) {
  const lastTime = blocksCacheTimestamps.get(uid);
  if (lastTime && Date.now() - lastTime < BLOCKS_CACHE_TTL_MS) {
    return blockedUsersCache.get(uid) || new Set();
  }
  try {
    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: uid }, { blockedId: uid }] },
      select: { blockerId: true, blockedId: true },
    });
    const set = new Set();
    blocks.forEach((b) => {
      if (b.blockerId === uid) set.add(b.blockedId);
      if (b.blockedId === uid) set.add(b.blockerId);
    });
    blockedUsersCache.set(uid, set);
    blocksCacheTimestamps.set(uid, Date.now());
    return set;
  } catch {
    return blockedUsersCache.get(uid) || new Set();
  }
}

const CACHE_TTL_MS = 60 * 1000;

async function getCachedUserData(userId) {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const userDb = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { clerkUserId: userId }] },
      include: { profile: true, subscription: true },
    });

    const now = new Date();
    let isVIP = false;

    if (userDb) {
      if (userDb.vip_expires_at && new Date(userDb.vip_expires_at).getTime() <= now.getTime()) {
        isVIP = false;
      } else if (userDb.subscription) {
        const subEnd = userDb.subscription.endDate || userDb.subscription.currentPeriodEnd;
        if (subEnd && new Date(subEnd).getTime() <= now.getTime()) {
          isVIP = false;
        } else if (userDb.subscription.isActive === true && userDb.subscription.plan === 'VIP') {
          isVIP = true;
        }
      }

      if (!isVIP && (userDb.is_vip || userDb.membershipTier === 'VIP')) {
        if (!userDb.vip_expires_at || new Date(userDb.vip_expires_at).getTime() > now.getTime()) {
          isVIP = true;
        }
      }
    }

    const userInterests = userDb?.profile?.interests
      ? userDb.profile.interests.split(',').map((s) => s.trim().toLowerCase())
      : [];

    const data = {
      userId: userDb?.id || userId,
      username: userDb?.username || `user_${userId.slice(0, 6)}`,
      vipUsername: userDb?.vipUsername || null,
      fullName: userDb?.fullName || userDb?.displayName || userDb?.username || 'Stranger',
      avatarUrl: userDb?.profile?.avatarUrl || null,
      avatarEmoji: userDb?.profile?.avatarEmoji || '😊',
      gender: userDb?.profile?.gender || 'unspecified',
      preferredGender: userDb?.profile?.preferredGender || 'auto',
      mood: userDb?.profile?.mood || 'chill',
      bio: userDb?.profile?.bio || '',
      personalityPreferences: userDb?.profile?.interests || '',
      tags: userInterests,
      language: userDb?.profile?.language || 'english',
      plan: isVIP ? 'vip' : 'free',
      isVIP,
    };

    userCache.set(userId, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    return {
      userId,
      username: `user_${userId.slice(0, 6)}`,
      vipUsername: null,
      fullName: 'Stranger',
      avatarUrl: null,
      avatarEmoji: '😊',
      gender: 'unspecified',
      preferredGender: 'auto',
      mood: 'chill',
      bio: '',
      personalityPreferences: '',
      tags: [],
      language: 'english',
      plan: 'free',
      isVIP: false,
    };
  }
}

// ── HTTP Server & Health Endpoints ───────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/api/health') {
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        uptime: process.uptime(),
        memory: {
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        },
        connections: {
          activeSockets: io.engine ? io.engine.clientsCount : 0,
          activeUsers: userSockets.size,
          activeMatches: activeMatches.size,
          queueLength: randomMatchQueue.length,
        },
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('CupidX Realtime Chat Production Socket.IO Server is running.\n');
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('cupidxchat.in')) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
});

// ── Authentication Middleware ────────────────────────────────────────────────
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const isTestAllowed = process.env.NODE_ENV !== 'production';
    const isTest = isTestAllowed && (socket.handshake.auth?.isLoadTest || socket.handshake.query?.isLoadTest);
    const testUserId = socket.handshake.auth?.userId || socket.handshake.query?.userId;

    if (!token) {
      if (isTest && testUserId) {
        socket.user = {
          userId: String(testUserId),
          username: socket.handshake.auth?.username || socket.handshake.query?.username || `tester_${testUserId}`,
          role: 'USER',
        };
        return next();
      }
      return next(new Error('Authentication token required'));
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        if (isTest && testUserId) {
          socket.user = {
            userId: String(testUserId),
            username: socket.handshake.auth?.username || `tester_${testUserId}`,
            role: 'USER',
          };
          return next();
        }
        return next(new Error('Invalid token'));
      }
      socket.user = decoded;
      next();
    });
  } catch (error) {
    next(new Error('Internal Authentication Error'));
  }
});

// ── Smart Compatibility Scoring ──────────────────────────────────────────────
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

function calculateMatchScore(candidateA, candidateB, now) {
  if (candidateA.userId === candidateB.userId) {
    return { canMatch: false, score: -1 };
  }

  const recentA = recentPartners.get(candidateA.userId);
  if (recentA && recentA.has(candidateB.userId)) {
    return { canMatch: false, score: -1 };
  }
  const recentB = recentPartners.get(candidateB.userId);
  if (recentB && recentB.has(candidateA.userId)) {
    return { canMatch: false, score: -1 };
  }

  const blockedA = blockedUsersCache.get(candidateA.userId);
  if (blockedA && blockedA.has(candidateB.userId)) {
    return { canMatch: false, score: -1 };
  }
  const blockedB = blockedUsersCache.get(candidateB.userId);
  if (blockedB && blockedB.has(candidateA.userId)) {
    return { canMatch: false, score: -1 };
  }

  let score = 0;
  const waitTimeA = now - candidateA.joinTime;
  const waitTimeB = now - candidateB.joinTime;

  const prefA = candidateA.isVIP ? (candidateA.genderPref || 'auto') : 'auto';
  const prefB = candidateB.isVIP ? (candidateB.genderPref || 'auto') : 'auto';

  if (candidateA.isVIP && prefA !== 'auto' && prefA !== 'any') {
    const isGenderMatch = prefA.toLowerCase() === (candidateB.gender || '').toLowerCase();
    if (isGenderMatch) {
      score += 3;
    } else if (waitTimeA < 8000) {
      return { canMatch: false, score: -1 };
    }
  }

  if (candidateB.isVIP && prefB !== 'auto' && prefB !== 'any') {
    const isGenderMatch = prefB.toLowerCase() === (candidateA.gender || '').toLowerCase();
    if (isGenderMatch) {
      score += 3;
    } else if (waitTimeB < 8000) {
      return { canMatch: false, score: -1 };
    }
  }

  const tagsA = candidateA.tags || [];
  const tagsB = candidateB.tags || [];
  if (tagsA.length > 0 && tagsB.length > 0) {
    const shared = tagsA.filter((t) => tagsB.includes(t));
    score += shared.length * 2;
  }

  if (areMoodsCompatible(candidateA.mood, candidateB.mood)) {
    score += 1;
  }

  if (candidateA.isVIP || candidateB.isVIP) {
    score += 1;
  }

  score += Math.max(waitTimeA, waitTimeB) / 10000;
  // Requirement 4: Genuine randomness tie-breaker for equal scores
  score += Math.random() * 0.4;

  return { canMatch: true, score };
}

// ── In-Memory Queue Matcher (Atomic & Random Selection) ──────────────────────
function processMatchQueue() {
  if (randomMatchQueue.length < 2) return;

  const now = Date.now();
  console.log(`[MATCH_ATTEMPT] Queue length: ${randomMatchQueue.length}`);

  // Randomize evaluation order so matching is genuinely unpredictable among eligible users
  const candidatesShuffled = [...randomMatchQueue].sort(() => Math.random() - 0.5);

  let bestPair = null;
  let highestScore = -1;

  for (let i = 0; i < candidatesShuffled.length; i++) {
    const candidateA = candidatesShuffled[i];
    for (let j = i + 1; j < candidatesShuffled.length; j++) {
      const candidateB = candidatesShuffled[j];

      const { canMatch, score } = calculateMatchScore(candidateA, candidateB, now);
      if (canMatch && score > highestScore) {
        highestScore = score;
        bestPair = [candidateA, candidateB];
      }
    }
  }

  if (bestPair) {
    const [candidateA, candidateB] = bestPair;

    // Requirement 1 & 6: Remove both users from waiting queue atomically
    randomMatchQueue = randomMatchQueue.filter(
      (c) => c.userId !== candidateA.userId && c.userId !== candidateB.userId
    );

    const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const roomId = `room_${matchId}`;

    const matchRecord = {
      matchId,
      roomId,
      userA: candidateA,
      userB: candidateB,
      createdAt: Date.now(),
    };

    activeMatches.set(matchId, matchRecord);
    userActiveMatch.set(candidateA.userId, matchId);
    userActiveMatch.set(candidateB.userId, matchId);

    console.log(`[MATCH_SUCCESS] Matched ${candidateA.userId} (${candidateA.username}) <-> ${candidateB.userId} (${candidateB.username})`);
    console.log(`[SESSION_CREATED] Room: ${roomId} for Match: ${matchId}`);

    // Track recent partners to avoid immediate rematch upon NEXT
    if (!recentPartners.has(candidateA.userId)) recentPartners.set(candidateA.userId, new Set());
    const rA = recentPartners.get(candidateA.userId);
    rA.add(candidateB.userId);
    if (rA.size > 5) rA.delete(rA.values().next().value);

    if (!recentPartners.has(candidateB.userId)) recentPartners.set(candidateB.userId, new Set());
    const rB = recentPartners.get(candidateB.userId);
    rB.add(candidateA.userId);
    if (rB.size > 5) rB.delete(rB.values().next().value);

    const socketsA = userSockets.get(candidateA.userId);
    if (socketsA) {
      socketsA.forEach((sId) => {
        const s = io.sockets.sockets.get(sId);
        if (s) {
          s.join(roomId);
          s.currentRoomId = roomId;
          console.log(`[ROOM_JOIN] User A socket ${sId} joined ${roomId}`);
        }
      });
    }

    const socketsB = userSockets.get(candidateB.userId);
    if (socketsB) {
      socketsB.forEach((sId) => {
        const s = io.sockets.sockets.get(sId);
        if (s) {
          s.join(roomId);
          s.currentRoomId = roomId;
          console.log(`[ROOM_JOIN] User B socket ${sId} joined ${roomId}`);
        }
      });
    }

    io.to(roomId).emit('match_established', { matchId, roomId });

    if (socketsA) {
      socketsA.forEach((sId) => {
        io.to(sId).emit('random_match_found', {
          matchId,
          roomId,
          partner: {
            id: candidateB.userId,
            username: candidateB.username,
            vipUsername: candidateB.vipUsername || null,
            fullName: candidateB.fullName,
            displayName: candidateB.fullName,
            avatarUrl: candidateB.avatarUrl,
            avatarEmoji: candidateB.avatarEmoji || '😊',
            gender: candidateB.gender,
            mood: candidateB.mood || 'chill',
            bio: candidateB.bio || '',
            personalityPreferences: candidateB.personalityPreferences || '',
            isVIP: candidateB.isVIP,
            plan: candidateB.plan,
          },
        });
      });
    }

    if (socketsB) {
      socketsB.forEach((sId) => {
        io.to(sId).emit('random_match_found', {
          matchId,
          roomId,
          partner: {
            id: candidateA.userId,
            username: candidateA.username,
            vipUsername: candidateA.vipUsername || null,
            fullName: candidateA.fullName,
            displayName: candidateA.fullName,
            avatarUrl: candidateA.avatarUrl,
            avatarEmoji: candidateA.avatarEmoji || '😊',
            gender: candidateA.gender,
            mood: candidateA.mood || 'chill',
            bio: candidateA.bio || '',
            personalityPreferences: candidateA.personalityPreferences || '',
            isVIP: candidateA.isVIP,
            plan: candidateA.plan,
          },
        });
      });
    }

    if (randomMatchQueue.length >= 2) {
      setImmediate(processMatchQueue);
    }
  }
}

// ── Clean Up Match ───────────────────────────────────────────────────────────
function teardownMatch(matchId, reason, triggeringUserId) {
  const match = activeMatches.get(matchId);
  if (!match) return;

  const { roomId, userA, userB } = match;

  io.to(roomId).emit('partner_left', {
    reason: reason || 'chat_ended',
    triggeringUserId: triggeringUserId || null,
  });

  const sA = userSockets.get(userA.userId);
  if (sA) {
    sA.forEach((sId) => {
      const s = io.sockets.sockets.get(sId);
      if (s) {
        s.leave(roomId);
        s.currentRoomId = null;
        console.log(`[ROOM_LEAVE] User A socket ${sId} left ${roomId}`);
      }
    });
  }

  const sB = userSockets.get(userB.userId);
  if (sB) {
    sB.forEach((sId) => {
      const s = io.sockets.sockets.get(sId);
      if (s) {
        s.leave(roomId);
        s.currentRoomId = null;
        console.log(`[ROOM_LEAVE] User B socket ${sId} left ${roomId}`);
      }
    });
  }

  activeMatches.delete(matchId);
  userActiveMatch.delete(userA.userId);
  userActiveMatch.delete(userB.userId);

  console.log(`[SESSION_CLEANUP] Match ${matchId} (Room: ${roomId}) ended: ${reason}. Ephemeral state cleared.`);

  // Asynchronously purge any DB/ephemeral records for this session
  setImmediate(async () => {
    try {
      await prisma.$transaction([
        prisma.chatSession.updateMany({
          where: { id: matchId },
          data: { status: 'ENDED', endedAt: new Date() },
        }),
        prisma.message.deleteMany({
          where: { chatSessionId: matchId },
        }),
        prisma.matchmakingQueue.updateMany({
          where: { chatSessionId: matchId },
          data: { status: 'CANCELLED', chatSessionId: null, partnerUserId: null },
        }),
      ]);
    } catch {}
  });
}

// ── Connection Event Router ──────────────────────────────────────────────────
io.on('connection', async (socket) => {
  const { userId, username } = socket.user;

  // 1. Cancel reconnect grace timer if this user was temporarily disconnected
  if (reconnectGraceTimers.has(userId)) {
    clearTimeout(reconnectGraceTimers.get(userId));
    reconnectGraceTimers.delete(userId);
  }

  // 2. Track user socket mappings
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socket.id);

  socketToUser.set(socket.id, {
    userId,
    username,
    connectedAt: Date.now(),
  });

  // 3. Seamless Session Recovery on Reconnection
  const existingMatchId = userActiveMatch.get(userId);
  if (existingMatchId) {
    const match = activeMatches.get(existingMatchId);
    if (match) {
      socket.join(match.roomId);
      socket.currentRoomId = match.roomId;

      const isUserA = match.userA.userId === userId;
      const partner = isUserA ? match.userB : match.userA;

      socket.emit('random_match_found', {
        matchId: match.matchId,
        roomId: match.roomId,
        partner: {
          id: partner.userId,
          username: partner.username,
          fullName: partner.fullName,
          displayName: partner.fullName,
          avatarUrl: partner.avatarUrl,
          avatarEmoji: partner.avatarEmoji || '😊',
          gender: partner.gender,
          isVIP: partner.isVIP,
          plan: partner.plan,
        },
        reconnected: true,
      });

      socket.to(match.roomId).emit('partner_reconnected', { userId });
      console.log(`[ROOM_JOIN] Reconnected user ${userId} re-joined room ${match.roomId}`);
    }
  }

  // 4. Update presence in background asynchronously
  setImmediate(async () => {
    try {
      await prisma.profile.updateMany({
        where: { OR: [{ userId }, { user: { clerkUserId: userId } }] },
        data: { isOnline: true, lastSeen: new Date() },
      });
    } catch {}
  });

  // ── Event: Join Random Queue ───────────────────────────────────────────────
  socket.on('join_random_queue', async (preferences = {}) => {
    const currentMatchId = userActiveMatch.get(userId);
    if (currentMatchId) {
      teardownMatch(currentMatchId, 'partner_skipped', userId);
    }

    randomMatchQueue = randomMatchQueue.filter((c) => c.userId !== userId);

    const [userData] = await Promise.all([
      getCachedUserData(userId),
      getCachedBlockedUsers(userId),
    ]);

    if (!userSockets.has(userId)) return;
    if (userActiveMatch.has(userId)) return;

    const candidate = {
      socketId: socket.id,
      userId,
      username: userData.username,
      fullName: userData.fullName,
      avatarUrl: userData.avatarUrl,
      avatarEmoji: userData.avatarEmoji,
      gender: preferences.gender || userData.gender || 'unspecified',
      genderPref: preferences.preferredGender || preferences.genderPref || userData.preferredGender || 'auto',
      mood: preferences.mood || userData.mood || 'chill',
      tags: preferences.tags && Array.isArray(preferences.tags) ? preferences.tags : userData.tags,
      language: preferences.language || userData.language || 'english',
      plan: userData.plan,
      isVIP: userData.isVIP,
      joinTime: Date.now(),
    };

    const existingIdx = randomMatchQueue.findIndex((c) => c.userId === userId);
    if (existingIdx !== -1) {
      randomMatchQueue[existingIdx] = candidate;
    } else {
      randomMatchQueue.push(candidate);
    }
    console.log(`[QUEUE_JOIN] User ${userId} (${candidate.username}) joined queue. Total in queue: ${randomMatchQueue.length}`);
    socket.emit('queue_joined', { status: 'searching', isVIP: candidate.isVIP, plan: candidate.plan });

    processMatchQueue();
  });

  // ── Event: Leave Random Queue ──────────────────────────────────────────────
  socket.on('leave_random_queue', () => {
    randomMatchQueue = randomMatchQueue.filter((c) => c.userId !== userId);
    console.log(`[QUEUE_LEAVE] User ${userId} left queue. Total in queue: ${randomMatchQueue.length}`);
    socket.emit('queue_left');
  });

  // ── Event: Send Random Message ─────────────────────────────────────────────
  socket.on('send_random_message', (data, callback) => {
    const matchId = userActiveMatch.get(userId);
    if (!matchId) {
      if (typeof callback === 'function') callback({ error: 'No active chat session found.' });
      return;
    }

    const match = activeMatches.get(matchId);
    if (!match) {
      if (typeof callback === 'function') callback({ error: 'Chat session has expired.' });
      return;
    }

    // Requirement 9: Strict Server-Side Room Participant Authorization
    if (match.userA.userId !== userId && match.userB.userId !== userId) {
      if (typeof callback === 'function') callback({ error: 'Unauthorized to post in this room.' });
      return;
    }

    const { content, imageUrl, clientMessageId } = data || {};
    if (!content && !imageUrl) {
      if (typeof callback === 'function') callback({ error: 'Content or image is required.' });
      return;
    }

    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      clientMessageId: clientMessageId || null,
      chatSessionId: matchId,
      matchId,
      senderId: userId,
      senderUsername: username,
      content: (content || '').trim(),
      imageUrl: imageUrl || null,
      createdAt: new Date().toISOString(),
      status: 'SENT',
    };

    io.to(match.roomId).emit('receive_random_message', messageObj);
    console.log(`[MESSAGE_SENT] User ${userId} in room ${match.roomId}`);

    if (typeof callback === 'function') {
      callback({ success: true, message: messageObj });
    }
  });

  // ── Event: Ephemeral Typing Indicator (Zero DB hit, zero reconnect) ────────
  socket.on('random_typing_status', ({ isTyping }) => {
    const matchId = userActiveMatch.get(userId);
    if (!matchId) return;

    const match = activeMatches.get(matchId);
    if (match && match.roomId) {
      socket.to(match.roomId).emit('partner_typing_status', {
        isTyping: Boolean(isTyping),
        userId,
      });
    }
  });

  // ── Event: Next Partner (Instant skip & re-queue) ──────────────────────────
  socket.on('next_partner', async (preferences = {}) => {
    const currentMatchId = userActiveMatch.get(userId);
    if (currentMatchId) {
      console.log(`[NEXT] User ${userId} skipped match ${currentMatchId}`);
      teardownMatch(currentMatchId, 'partner_skipped', userId);
    }

    randomMatchQueue = randomMatchQueue.filter((c) => c.userId !== userId);
    const [userData] = await Promise.all([
      getCachedUserData(userId),
      getCachedBlockedUsers(userId),
    ]);

    if (!userSockets.has(userId)) return;
    if (userActiveMatch.has(userId)) {
      teardownMatch(userActiveMatch.get(userId), 'partner_skipped', userId);
    }

    const candidate = {
      socketId: socket.id,
      userId,
      username: userData.username,
      fullName: userData.fullName,
      avatarUrl: userData.avatarUrl,
      avatarEmoji: userData.avatarEmoji,
      gender: preferences.gender || userData.gender || 'unspecified',
      genderPref: preferences.preferredGender || preferences.genderPref || userData.preferredGender || 'auto',
      mood: preferences.mood || userData.mood || 'chill',
      tags: preferences.tags && Array.isArray(preferences.tags) ? preferences.tags : userData.tags,
      language: preferences.language || userData.language || 'english',
      plan: userData.plan,
      isVIP: userData.isVIP,
      joinTime: Date.now(),
    };

    const existingIdx = randomMatchQueue.findIndex((c) => c.userId === userId);
    if (existingIdx !== -1) {
      randomMatchQueue[existingIdx] = candidate;
    } else {
      randomMatchQueue.push(candidate);
    }
    console.log(`[QUEUE_JOIN] [NEXT] User ${userId} re-queued for next partner. Total in queue: ${randomMatchQueue.length}`);
    socket.emit('queue_joined', { status: 'searching', isVIP: candidate.isVIP, plan: candidate.plan });

    processMatchQueue();
  });

  // ── Event: End Random Chat ─────────────────────────────────────────────────
  socket.on('end_random_chat', () => {
    const currentMatchId = userActiveMatch.get(userId);
    if (currentMatchId) {
      console.log(`[SESSION_CLEANUP] User ${userId} requested chat end for match ${currentMatchId}`);
      teardownMatch(currentMatchId, 'chat_ended', userId);
    }
    randomMatchQueue = randomMatchQueue.filter((c) => c.userId !== userId);
    socket.emit('chat_ended_confirm');
  });

  // ── Private Chat: 1-on-1 VIP Messaging ─────────────────────────────────────
  socket.on('send_message', async (payload, callback) => {
    try {
      const { receiverId, content, imageUrl, clientMessageId } = payload || {};
      if (!receiverId || (!content && !imageUrl)) {
        if (typeof callback === 'function') callback({ error: 'Receiver ID and content are required' });
        return;
      }

      // Check block relations before delivering message
      const blocked = await getCachedBlockedUsers(userId);
      if (blocked.has(receiverId)) {
        if (typeof callback === 'function') callback({ error: 'Communication with this member is unavailable.' });
        return;
      }

      const msgObj = {
        id: `pmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        clientMessageId: clientMessageId || null,
        senderId: userId,
        receiverId,
        content: (content || '').trim(),
        imageUrl: imageUrl || null,
        status: 'SENT',
        createdAt: new Date().toISOString(),
      };

      const recipientSockets = userSockets.get(receiverId);
      if (recipientSockets) {
        recipientSockets.forEach((sId) => {
          io.to(sId).emit('receive_message', msgObj);
        });
      }

      const mySockets = userSockets.get(userId);
      if (mySockets) {
        mySockets.forEach((sId) => {
          io.to(sId).emit('receive_message', msgObj);
        });
      }

      if (typeof callback === 'function') {
        callback({ success: true, message: msgObj });
      }

      setImmediate(async () => {
        try {
          // Canonical ordering u1 < u2
          const [u1, u2] = userId < receiverId ? [userId, receiverId] : [receiverId, userId];
          const conv = await prisma.conversation.upsert({
            where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
            update: { lastMessageAt: new Date() },
            create: { user1Id: u1, user2Id: u2, lastMessageAt: new Date() },
          });

          await prisma.privateMessage.create({
            data: {
              conversationId: conv.id,
              senderId: userId,
              content: msgObj.content,
              imageUrl: msgObj.imageUrl,
              clientMessageId: msgObj.clientMessageId,
            },
          });
        } catch (dbErr) {
          console.warn('Private message DB persistence notice:', dbErr.message);
        }
      });
    } catch (e) {
      if (typeof callback === 'function') callback({ error: 'Failed to send private message' });
    }
  });

  // ── Private Chat: Typing Status ────────────────────────────────────────────
  socket.on('typing_status', ({ receiverId, isTyping }) => {
    if (!receiverId) return;
    const recipientSockets = userSockets.get(receiverId);
    if (recipientSockets) {
      recipientSockets.forEach((sId) => {
        io.to(sId).emit('typing_status_changed', {
          senderId: userId,
          isTyping: Boolean(isTyping),
        });
      });
    }
  });

  // ── Private Chat: Read Receipts ───────────────────────────────────────────
  socket.on('mark_messages_read', ({ senderId }) => {
    if (!senderId) return;
    const senderSockets = userSockets.get(senderId);
    if (senderSockets) {
      senderSockets.forEach((sId) => {
        io.to(sId).emit('messages_read_receipt', { readerId: userId });
      });
    }

    setImmediate(async () => {
      try {
        const [u1, u2] = userId < senderId ? [userId, senderId] : [senderId, userId];
        const conv = await prisma.conversation.findUnique({
          where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
        });
        if (conv) {
          await prisma.privateMessage.updateMany({
            where: { conversationId: conv.id, senderId, status: 'SENT' },
            data: { status: 'READ' },
          });
        }
      } catch {}
    });
  });

  // ── Private Chat: Delete Message (Targeted Emit + DB Delete) ───────────────
  socket.on('delete_message', ({ messageId, receiverId }, callback) => {
    if (!messageId) return;

    // Targeted notification only to the sender and recipient sockets
    const mySockets = userSockets.get(userId);
    if (mySockets) {
      mySockets.forEach((sId) => io.to(sId).emit('message_deleted', { messageId, deletedBy: userId }));
    }
    if (receiverId) {
      const recipientSockets = userSockets.get(receiverId);
      if (recipientSockets) {
        recipientSockets.forEach((sId) => io.to(sId).emit('message_deleted', { messageId, deletedBy: userId }));
      }
    }

    if (typeof callback === 'function') callback({ success: true });

    setImmediate(async () => {
      try {
        await prisma.privateMessage.deleteMany({
          where: { id: messageId, senderId: userId },
        });
      } catch {}
    });
  });

  // ── Disconnect Handler with 10-Second Grace Period ─────────────────────────
  socket.on('disconnect', () => {
    socketToUser.delete(socket.id);

    const userSocketSet = userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      if (userSocketSet.size === 0) {
        userSockets.delete(userId);

        randomMatchQueue = randomMatchQueue.filter((c) => c.userId !== userId);

        const activeMId = userActiveMatch.get(userId);
        if (activeMId) {
          const timer = setTimeout(() => {
            reconnectGraceTimers.delete(userId);
            if (!userSockets.has(userId)) {
              teardownMatch(activeMId, 'disconnected', userId);
            }
          }, 10000);
          reconnectGraceTimers.set(userId, timer);
        }

        setTimeout(async () => {
          if (!userSockets.has(userId)) {
            try {
              await prisma.profile.updateMany({
                where: { OR: [{ userId }, { user: { clerkUserId: userId } }] },
                data: { isOnline: false, lastSeen: new Date() },
              });
              io.emit('user_status_changed', { userId, username, isOnline: false });
            } catch {}
          }
        }, 15000);
      }
    }
  });
});

// ── Global Queue Stats for Admin Dashboard ───────────────────────────────────
global.getQueueStats = () => ({
  queueLength: randomMatchQueue.length,
  activeRandomChatsCount: activeMatches.size,
  connectedUsersCount: userSockets.size,
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = () => {
  console.log('\nGracefully shutting down CupidX Realtime Socket Server...');
  io.close(() => {
    server.close(async () => {
      try {
        await prisma.$disconnect();
      } catch {}
      console.log('Server and database connections drained cleanly.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

server.listen(PORT, () => {
  console.log(`⚡ CupidX Production Realtime Socket.IO Server running on port ${PORT}`);
  console.log(`   - HTTP Health Check: http://localhost:${PORT}/health`);
  console.log(`   - SQLite Storage: ${dbPath} (WAL Mode enabled)`);
});
