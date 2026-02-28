const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

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

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server startup
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     Chat Application Server Started    ║
╚════════════════════════════════════════╝
  
  Server running on: http://localhost:${PORT}
  
  Open your browser and navigate to:
  http://localhost:${PORT}
  
  Press Ctrl+C to stop the server
  `);
});
