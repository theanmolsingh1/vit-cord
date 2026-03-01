const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Render Postgres configuration for Ranters feature
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const dbPool = hasDatabaseUrl ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
}) : null;
let rantersDbReady = false;

async function initializeRantersDatabase() {
  if (!dbPool) {
    console.warn('Ranters DB disabled: DATABASE_URL is not set.');
    return;
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS ranter_colleges (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ranter_colleges_name_unique
    ON ranter_colleges (LOWER(name));
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS ranter_posts (
      id BIGSERIAL PRIMARY KEY,
      college_id INTEGER NOT NULL REFERENCES ranter_colleges(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS ranter_posts_college_created_idx
    ON ranter_posts (college_id, created_at DESC);
  `);

  rantersDbReady = true;
}

function validateRanterName(name) {
  return typeof name === 'string' &&
    name.trim().length >= 2 &&
    name.trim().length <= 30 &&
    /^[a-zA-Z0-9_-]+$/.test(name.trim());
}

function validateCollegeName(name) {
  return typeof name === 'string' &&
    name.trim().length >= 2 &&
    name.trim().length <= 80;
}

function validateRantMessage(message) {
  return typeof message === 'string' &&
    message.trim().length >= 1 &&
    message.trim().length <= 1000;
}

// In-memory data structure for rooms
const rooms = {};
const randomWaitingQueue = [];
const randomPairs = new Map(); // socketId -> partnerSocketId

// Helper function to get room info
function getRoomInfo(roomId) {
  return rooms[roomId] || null;
}

// Helper function to list all public rooms
function getPublicRooms() {
  return Object.entries(rooms)
    .filter(([, room]) => room.isPublic)
    .map(([roomId, room]) => ({
      roomId,
      maxSeats: room.maxSeats,
      currentUsers: getUserCountInRoom(roomId),
      createdAt: room.createdAt
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function emitPublicRoomsUpdate(targetSocket = null) {
  const publicRooms = getPublicRooms();
  if (targetSocket) {
    targetSocket.emit('publicRooms', publicRooms);
    return;
  }
  io.emit('publicRooms', publicRooms);
}

// Helper function to get user count in room
function getUserCountInRoom(roomId) {
  if (!rooms[roomId]) return 0;
  const Room = io.sockets.adapter.rooms.get(roomId);
  return Room ? Room.size : 0;
}

// Helper function to get all users in a room
function getUsersInRoom(roomId) {
  if (!rooms[roomId]) return [];
  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (!sockets) return [];
  
  const users = [];
  sockets.forEach(socketId => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.data && socket.data.username) {
      users.push(socket.data.username);
    }
  });
  return users;
}

// Helper function to get all users with socket IDs in a room
function getUsersDetailedInRoom(roomId) {
  if (!rooms[roomId]) return [];
  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (!sockets) return [];

  const users = [];
  sockets.forEach(socketId => {
    const roomSocket = io.sockets.sockets.get(socketId);
    if (roomSocket && roomSocket.data && roomSocket.data.username) {
      users.push({
        socketId,
        username: roomSocket.data.username
      });
    }
  });
  return users;
}

function isSocketInRoom(roomId, socketId) {
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  return roomSockets ? roomSockets.has(socketId) : false;
}

function dequeueRandomSocket(socketId) {
  const index = randomWaitingQueue.indexOf(socketId);
  if (index !== -1) {
    randomWaitingQueue.splice(index, 1);
  }
}

function getRandomPartner(socketId) {
  return randomPairs.get(socketId) || null;
}

function clearRandomPair(socketId) {
  const partnerSocketId = getRandomPartner(socketId);
  if (!partnerSocketId) return null;

  randomPairs.delete(socketId);
  randomPairs.delete(partnerSocketId);
  return partnerSocketId;
}

function isRandomPair(socketId, targetSocketId) {
  return randomPairs.get(socketId) === targetSocketId;
}

function tryMatchRandomUser(socket) {
  dequeueRandomSocket(socket.id);

  while (randomWaitingQueue.length > 0) {
    const candidateId = randomWaitingQueue.shift();
    if (!candidateId || candidateId === socket.id) {
      continue;
    }

    const candidateSocket = io.sockets.sockets.get(candidateId);
    if (!candidateSocket || getRandomPartner(candidateId)) {
      continue;
    }

    randomPairs.set(socket.id, candidateId);
    randomPairs.set(candidateId, socket.id);

    socket.emit('randomMatched', {
      partnerSocketId: candidateId,
      partnerName: candidateSocket.data.randomName || 'Stranger',
      initiator: true
    });

    candidateSocket.emit('randomMatched', {
      partnerSocketId: socket.id,
      partnerName: socket.data.randomName || 'Stranger',
      initiator: false
    });
    return true;
  }

  randomWaitingQueue.push(socket.id);
  socket.emit('randomWaiting');
  return false;
}

function endRandomSession(socket, { notifyPartner = true } = {}) {
  dequeueRandomSocket(socket.id);
  const partnerSocketId = clearRandomPair(socket.id);
  if (!partnerSocketId) return;

  if (notifyPartner) {
    io.to(partnerSocketId).emit('randomDisconnected', {
      message: 'Stranger disconnected'
    });
  }
}

// Socket.IO Events
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  emitPublicRoomsUpdate(socket);

  /**
   * Event: Create Room
   * Validates unique room ID and creates new room
   */
  socket.on('createRoom', (data, callback) => {
    const { roomId, maxSeats, username, isPublic = true, password = '' } = data;

    // Validation
    if (!roomId || !maxSeats || !username) {
      return callback({ success: false, message: 'Missing required fields' });
    }

    if (maxSeats < 1 || maxSeats > 100) {
      return callback({ success: false, message: 'Maximum seats must be between 1 and 100' });
    }

    const normalizedPassword = typeof password === 'string' ? password.trim() : '';
    if (!isPublic) {
      if (!normalizedPassword || normalizedPassword.length < 4 || normalizedPassword.length > 50) {
        return callback({ success: false, message: 'Password must be 4 to 50 characters for private rooms' });
      }
    }

    // Check if room already exists
    if (rooms[roomId]) {
      return callback({ success: false, message: 'Room ID already exists' });
    }

    // Create room
    rooms[roomId] = {
      maxSeats: maxSeats,
      createdAt: new Date(),
      users: [username],
      isPublic: Boolean(isPublic),
      password: isPublic ? null : normalizedPassword
    };

    // Store user info on socket
    socket.data.roomId = roomId;
    socket.data.username = username;

    // Join the socket to the room
    socket.join(roomId);

    console.log(`Room created: ${roomId} (max: ${maxSeats}) by ${username}`);

    // Send success response
    callback({ success: true, message: 'Room created successfully' });

    // Notify all users in the room about the new user
    io.to(roomId).emit('userJoined', {
      username: username,
      socketId: socket.id,
      users: getUsersInRoom(roomId),
      usersDetailed: getUsersDetailedInRoom(roomId),
      timestamp: new Date()
    });

    // Send initial room state
    socket.emit('roomState', {
      roomId: roomId,
      maxSeats: maxSeats,
      currentUsers: 1,
      users: getUsersInRoom(roomId),
      usersDetailed: getUsersDetailedInRoom(roomId)
    });

    emitPublicRoomsUpdate();
  });

  /**
   * Event: Join Room
   * Allows users to join existing rooms if seats available
   */
  socket.on('joinRoom', (data, callback) => {
    const { roomId, username, password = '' } = data;

    // Validation
    if (!roomId || !username) {
      return callback({ success: false, message: 'Missing required fields' });
    }

    // Check if room exists
    if (!rooms[roomId]) {
      return callback({ success: false, message: 'Room does not exist' });
    }

    const room = rooms[roomId];
    const currentUsers = getUserCountInRoom(roomId);

    if (!room.isPublic) {
      const normalizedPassword = typeof password === 'string' ? password.trim() : '';
      if (normalizedPassword !== room.password) {
        return callback({ success: false, message: 'Incorrect room password' });
      }
    }

    // Check if room is full
    if (currentUsers >= room.maxSeats) {
      return callback({ success: false, message: 'Room is full' });
    }

    // Check for duplicate username in the room
    const usersInRoom = getUsersInRoom(roomId);
    if (usersInRoom.includes(username)) {
      return callback({ success: false, message: 'Username already taken in this room' });
    }

    // Store user info on socket
    socket.data.roomId = roomId;
    socket.data.username = username;

    // Join the socket to the room
    socket.join(roomId);

    console.log(`User ${username} joined room ${roomId}`);

    // Send success response
    callback({ success: true, message: 'Joined room successfully' });

    // Notify all users in the room
    io.to(roomId).emit('userJoined', {
      username: username,
      socketId: socket.id,
      users: getUsersInRoom(roomId),
      usersDetailed: getUsersDetailedInRoom(roomId),
      timestamp: new Date()
    });

    // Send room state to the new user
    socket.emit('roomState', {
      roomId: roomId,
      maxSeats: room.maxSeats,
      currentUsers: currentUsers + 1,
      users: getUsersInRoom(roomId),
      usersDetailed: getUsersDetailedInRoom(roomId)
    });

    emitPublicRoomsUpdate();
  });

  /**
   * Event: Send Message
   * Broadcasts message to all users in the room
   */
  socket.on('sendMessage', (data, callback) => {
    const { roomId, message } = data;
    const username = socket.data.username;

    // Validation
    if (!roomId || !message || !username) {
      return callback({ success: false, message: 'Invalid message' });
    }

    // Trim whitespace
    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return callback({ success: false, message: 'Message cannot be empty' });
    }

    if (trimmedMessage.length > 500) {
      return callback({ success: false, message: 'Message too long (max 500 characters)' });
    }

    // Verify user is in the room
    if (socket.data.roomId !== roomId) {
      return callback({ success: false, message: 'Not in this room' });
    }

    const timestamp = new Date();

    // Broadcast message to all users in the room
    io.to(roomId).emit('newMessage', {
      username: username,
      message: trimmedMessage,
      timestamp: timestamp
    });

    console.log(`[${roomId}] ${username}: ${trimmedMessage}`);
    callback({ success: true });
  });

  /**
   * Event: Leave Room
   * Removes user from room
   */
  socket.on('leaveRoom', () => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    if (!roomId) return;

    // Leave the socket from the room
    socket.leave(roomId);

    // Notify other users
    io.to(roomId).emit('userLeft', {
      username: username,
      socketId: socket.id,
      users: getUsersInRoom(roomId),
      usersDetailed: getUsersDetailedInRoom(roomId),
      timestamp: new Date()
    });

    // If room is empty, delete it
    const usersRemaining = getUserCountInRoom(roomId);
    if (usersRemaining === 0) {
      delete rooms[roomId];
      console.log(`Room ${roomId} deleted (empty)`);
    }

    console.log(`User ${username} left room ${roomId}`);

    // Clear socket data
    socket.data.roomId = null;
    socket.data.username = null;

    emitPublicRoomsUpdate();
  });

  /**
   * Event: Random Join (Vemege)
   * Adds user to random matchmaking queue.
   */
  socket.on('randomJoin', (data = {}, callback = () => {}) => {
    const { username = '' } = data;
    socket.data.randomName = String(username || '').trim().slice(0, 30) || 'Stranger';

    if (getRandomPartner(socket.id)) {
      return callback({ success: true, status: 'paired' });
    }

    tryMatchRandomUser(socket);
    callback({ success: true, status: 'searching' });
  });

  /**
   * Event: Random Next (Vemege)
   * Ends current pair (if any) and finds the next stranger.
   */
  socket.on('randomNext', (callback = () => {}) => {
    endRandomSession(socket, { notifyPartner: true });
    tryMatchRandomUser(socket);
    callback({ success: true });
  });

  /**
   * Event: Random Leave (Vemege)
   * Leaves queue and active random pair.
   */
  socket.on('randomLeave', (callback = () => {}) => {
    endRandomSession(socket, { notifyPartner: true });
    dequeueRandomSocket(socket.id);
    callback({ success: true });
  });

  /**
   * WebRTC Signaling for Random Chat: Offer
   */
  socket.on('randomOffer', (data, callback = () => {}) => {
    const { targetSocketId, offer } = data || {};
    if (!targetSocketId || !offer) {
      return callback({ success: false, message: 'Invalid offer payload' });
    }
    if (!isRandomPair(socket.id, targetSocketId)) {
      return callback({ success: false, message: 'Target is not your active random partner' });
    }

    io.to(targetSocketId).emit('randomOffer', {
      fromSocketId: socket.id,
      fromUsername: socket.data.randomName || 'Stranger',
      offer
    });
    callback({ success: true });
  });

  /**
   * WebRTC Signaling for Random Chat: Answer
   */
  socket.on('randomAnswer', (data, callback = () => {}) => {
    const { targetSocketId, answer } = data || {};
    if (!targetSocketId || !answer) {
      return callback({ success: false, message: 'Invalid answer payload' });
    }
    if (!isRandomPair(socket.id, targetSocketId)) {
      return callback({ success: false, message: 'Target is not your active random partner' });
    }

    io.to(targetSocketId).emit('randomAnswer', {
      fromSocketId: socket.id,
      fromUsername: socket.data.randomName || 'Stranger',
      answer
    });
    callback({ success: true });
  });

  /**
   * WebRTC Signaling for Random Chat: ICE Candidate
   */
  socket.on('randomIceCandidate', (data, callback = () => {}) => {
    const { targetSocketId, candidate } = data || {};
    if (!targetSocketId || !candidate) {
      return callback({ success: false, message: 'Invalid ICE payload' });
    }
    if (!isRandomPair(socket.id, targetSocketId)) {
      return callback({ success: false, message: 'Target is not your active random partner' });
    }

    io.to(targetSocketId).emit('randomIceCandidate', {
      fromSocketId: socket.id,
      fromUsername: socket.data.randomName || 'Stranger',
      candidate
    });
    callback({ success: true });
  });

  /**
   * Random text chat message between active pair
   */
  socket.on('randomSendMessage', (data, callback = () => {}) => {
    const { message } = data || {};
    const partnerSocketId = getRandomPartner(socket.id);

    if (!partnerSocketId) {
      return callback({ success: false, message: 'No active random partner' });
    }

    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) {
      return callback({ success: false, message: 'Message cannot be empty' });
    }
    if (text.length > 500) {
      return callback({ success: false, message: 'Message too long (max 500 characters)' });
    }

    const payload = {
      fromSocketId: socket.id,
      fromUsername: socket.data.randomName || 'Stranger',
      message: text,
      timestamp: new Date()
    };

    socket.emit('randomNewMessage', payload);
    io.to(partnerSocketId).emit('randomNewMessage', payload);
    callback({ success: true });
  });

  /**
   * Event: Disconnect
   * Handles unexpected disconnects
   */
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    console.log(`User disconnected: ${socket.id}`);

    if (roomId && username) {
      // Notify other users in the room
      io.to(roomId).emit('userLeft', {
        username: username,
        socketId: socket.id,
        users: getUsersInRoom(roomId),
        usersDetailed: getUsersDetailedInRoom(roomId),
        timestamp: new Date()
      });

      // If room is empty, delete it
      const usersRemaining = getUserCountInRoom(roomId);
      if (usersRemaining === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty after disconnect)`);
      }

      emitPublicRoomsUpdate();
    }

    endRandomSession(socket, { notifyPartner: true });
    dequeueRandomSocket(socket.id);
  });

  /**
   * WebRTC Signaling: Offer
   */
  socket.on('webrtcOffer', (data, callback = () => {}) => {
    const { roomId, targetSocketId, offer } = data || {};
    if (!roomId || !targetSocketId || !offer) {
      return callback({ success: false, message: 'Invalid offer payload' });
    }
    if (socket.data.roomId !== roomId) {
      return callback({ success: false, message: 'Sender is not in this room' });
    }
    if (!isSocketInRoom(roomId, targetSocketId)) {
      return callback({ success: false, message: 'Target user not in room' });
    }

    io.to(targetSocketId).emit('webrtcOffer', {
      roomId,
      fromSocketId: socket.id,
      fromUsername: socket.data.username,
      offer
    });
    callback({ success: true });
  });

  /**
   * WebRTC Signaling: Answer
   */
  socket.on('webrtcAnswer', (data, callback = () => {}) => {
    const { roomId, targetSocketId, answer } = data || {};
    if (!roomId || !targetSocketId || !answer) {
      return callback({ success: false, message: 'Invalid answer payload' });
    }
    if (socket.data.roomId !== roomId) {
      return callback({ success: false, message: 'Sender is not in this room' });
    }
    if (!isSocketInRoom(roomId, targetSocketId)) {
      return callback({ success: false, message: 'Target user not in room' });
    }

    io.to(targetSocketId).emit('webrtcAnswer', {
      roomId,
      fromSocketId: socket.id,
      fromUsername: socket.data.username,
      answer
    });
    callback({ success: true });
  });

  /**
   * WebRTC Signaling: ICE Candidate
   */
  socket.on('webrtcIceCandidate', (data, callback = () => {}) => {
    const { roomId, targetSocketId, candidate } = data || {};
    if (!roomId || !targetSocketId || !candidate) {
      return callback({ success: false, message: 'Invalid ICE payload' });
    }
    if (socket.data.roomId !== roomId) {
      return callback({ success: false, message: 'Sender is not in this room' });
    }
    if (!isSocketInRoom(roomId, targetSocketId)) {
      return callback({ success: false, message: 'Target user not in room' });
    }

    io.to(targetSocketId).emit('webrtcIceCandidate', {
      roomId,
      fromSocketId: socket.id,
      fromUsername: socket.data.username,
      candidate
    });
    callback({ success: true });
  });
});

/**
 * Ranters APIs
 */
app.get('/api/ranters/colleges', async (req, res) => {
  if (!rantersDbReady) {
    return res.status(503).json({ success: false, message: 'Ranters database is not configured' });
  }

  const queryText = String(req.query.q || '').trim();

  try {
    if (queryText.length > 0) {
      const result = await dbPool.query(`
        SELECT c.name,
               COUNT(p.id) FILTER (WHERE p.created_at >= NOW() - INTERVAL '7 days')::INT AS posts_last_week
        FROM ranter_colleges c
        LEFT JOIN ranter_posts p ON p.college_id = c.id
        WHERE c.name ILIKE $1
        GROUP BY c.id, c.name
        ORDER BY c.name ASC
        LIMIT 50
      `, [`%${queryText}%`]);
      return res.json({ success: true, colleges: result.rows });
    }

    const result = await dbPool.query(`
      SELECT c.name,
             COUNT(p.id) FILTER (WHERE p.created_at >= NOW() - INTERVAL '7 days')::INT AS posts_last_week
      FROM ranter_colleges c
      LEFT JOIN ranter_posts p ON p.college_id = c.id
      GROUP BY c.id, c.name
      ORDER BY posts_last_week DESC, c.name ASC
      LIMIT 100
    `);
    return res.json({ success: true, colleges: result.rows });
  } catch (error) {
    console.error('Ranters colleges fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch colleges' });
  }
});

app.post('/api/ranters/colleges', async (req, res) => {
  if (!rantersDbReady) {
    return res.status(503).json({ success: false, message: 'Ranters database is not configured' });
  }

  const name = String(req.body?.name || '').trim();
  if (!validateCollegeName(name)) {
    return res.status(400).json({ success: false, message: 'College name must be 2 to 80 characters' });
  }

  try {
    const result = await dbPool.query(`
      INSERT INTO ranter_colleges (name)
      VALUES ($1)
      ON CONFLICT (LOWER(name))
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `, [name]);
    return res.json({ success: true, college: result.rows[0] });
  } catch (error) {
    console.error('Ranters add college error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save college' });
  }
});

app.get('/api/ranters/posts', async (req, res) => {
  if (!rantersDbReady) {
    return res.status(503).json({ success: false, message: 'Ranters database is not configured' });
  }

  const college = String(req.query.college || '').trim();
  if (!validateCollegeName(college)) {
    return res.status(400).json({ success: false, message: 'Valid college is required' });
  }

  try {
    const collegeResult = await dbPool.query(
      'SELECT id, name FROM ranter_colleges WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [college]
    );

    if (collegeResult.rows.length === 0) {
      return res.json({ success: true, college: college, posts: [] });
    }

    const collegeId = collegeResult.rows[0].id;
    const postsResult = await dbPool.query(`
      SELECT author, message, created_at
      FROM ranter_posts
      WHERE college_id = $1
        AND created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 500
    `, [collegeId]);

    return res.json({
      success: true,
      college: collegeResult.rows[0].name,
      posts: postsResult.rows
    });
  } catch (error) {
    console.error('Ranters posts fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});

app.post('/api/ranters/posts', async (req, res) => {
  if (!rantersDbReady) {
    return res.status(503).json({ success: false, message: 'Ranters database is not configured' });
  }

  const collegeName = String(req.body?.collegeName || '').trim();
  const author = String(req.body?.author || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!validateCollegeName(collegeName)) {
    return res.status(400).json({ success: false, message: 'Valid college is required' });
  }
  if (!validateRanterName(author)) {
    return res.status(400).json({ success: false, message: 'Name must be 2-30 letters, numbers, underscores or hyphens' });
  }
  if (!validateRantMessage(message)) {
    return res.status(400).json({ success: false, message: 'Message must be 1 to 1000 characters' });
  }

  try {
    const collegeResult = await dbPool.query(`
      INSERT INTO ranter_colleges (name)
      VALUES ($1)
      ON CONFLICT (LOWER(name))
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `, [collegeName]);

    const collegeId = collegeResult.rows[0].id;

    const insertResult = await dbPool.query(`
      INSERT INTO ranter_posts (college_id, author, message)
      VALUES ($1, $2, $3)
      RETURNING author, message, created_at
    `, [collegeId, author, message]);

    return res.json({
      success: true,
      post: insertResult.rows[0]
    });
  } catch (error) {
    console.error('Ranters post create error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save post' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server startup
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initializeRantersDatabase();
    if (rantersDbReady) {
      console.log('Ranters DB initialized successfully.');
    }
  } catch (error) {
    console.error('Ranters DB initialization failed:', error);
  }

  server.listen(PORT, () => {
    console.log(`Server running on: http://localhost:${PORT}`);
  });
}

startServer();
