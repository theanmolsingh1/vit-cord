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
      users: getUsersInRoom(roomId),
      timestamp: new Date()
    });

    // Send initial room state
    socket.emit('roomState', {
      roomId: roomId,
      maxSeats: maxSeats,
      currentUsers: 1,
      users: getUsersInRoom(roomId)
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
      users: getUsersInRoom(roomId),
      timestamp: new Date()
    });

    // Send room state to the new user
    socket.emit('roomState', {
      roomId: roomId,
      maxSeats: room.maxSeats,
      currentUsers: currentUsers + 1,
      users: getUsersInRoom(roomId)
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
      users: getUsersInRoom(roomId),
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
        users: getUsersInRoom(roomId),
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
