# Real-Time Chat Room Application

A complete, production-ready real-time chat application built with Node.js, Express, and Socket.IO.

## Features

✅ **Create & Join Rooms** - Users can create unique chat rooms with a maximum seat limit or join existing rooms
✅ **Real-Time Messaging** - Instant message delivery using Socket.IO WebSocket technology
✅ **User Management** - Live user list showing all active participants in a room
✅ **Timestamps** - Every message includes a timestamp for reference
✅ **Auto-scroll** - Chat automatically scrolls to the latest messages
✅ **Leave Room** - Users can gracefully leave rooms
✅ **Disconnect Handling** - Properly manages unexpected disconnections
✅ **Responsive Design** - Works perfectly on desktop and mobile devices
✅ **Input Validation** - Client and server-side validation for safety
✅ **Clean UI** - Minimal, modern design with smooth animations

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js + Express
- **Real-Time:** Socket.IO
- **No Frameworks:** Vanilla JavaScript for simplicity and learning

## Project Structure

```
chat-app/
├── server.js                 # Main server file with Socket.IO logic
├── package.json             # Node.js dependencies
├── public/
│   ├── index.html          # Home page (create/join room)
│   ├── chat.html           # Chat room interface
│   ├── style.css           # Unified styling for both pages
│   ├── client.js           # Client logic for index.html
│   └── chat.js             # Client logic for chat.html
└── README.md               # This file
```

## Prerequisites

Before you start, make sure you have **Node.js and npm** installed on your system.

### ✅ Check if Node.js is installed:
```powershell
node --version
npm --version
```

If these commands don't work, Node.js is not installed.

## Installation & Setup

### Step 1: Install Node.js

**Windows:**
1. Download the LTS version from https://nodejs.org/
2. Run the installer and follow the installation wizard
3. Make sure to check **"Add to PATH"** during installation
4. Restart your terminal/PowerShell after installation

**macOS:**
```bash
brew install node
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install nodejs npm
```

### Step 2: Verify Installation

```powershell
node --version  # Should show version like v18.x.x or higher
npm --version   # Should show version like 8.x.x or higher
```

### Step 3: Install Dependencies

Navigate to the chat-app directory and install required packages:

```powershell
cd "c:\Users\LENOVO\Desktop\vit_cord\chat-app"
npm install
```

This will install:
- **express** (4.18.2) - Web framework
- **socket.io** (4.5.4) - Real-time communication library

The `node_modules` folder will be created automatically.

## Running the Server

### Start the application:

```powershell
cd "c:\Users\LENOVO\Desktop\vit_cord\chat-app"
npm start
```

Or directly:

```powershell
node server.js
```

### Expected output:
```
╔════════════════════════════════════════╗
║     Chat Application Server Started    ║
╚════════════════════════════════════════╝
  
  Server running on: http://localhost:3000
  
  Open your browser and navigate to:
  http://localhost:3000
  
  Press Ctrl+C to stop the server
```

### Open in browser:

1. Visit: **http://localhost:3000** in your web browser
2. You should see the Chat Rooms home page

## Usage Guide

### Creating a Room

1. **Click "Create Room" tab**
2. **Enter your name** (2-30 characters, letters/numbers/hyphens/underscores)
3. **Enter a unique Room ID** (2-50 characters)
4. **Set Maximum Seats** (1-100 users)
5. **Click "Create Room"**

You'll be redirected to the chat room as the first user.

### Joining a Room

1. **Click "Join Room" tab** (default)
2. **Enter your name** (must be unique in that room)
3. **Enter the Room ID** (created by another user)
4. **Click "Join Room"**

If the room exists and has available seats, you'll join the chat.

### Chatting

- **Type messages** in the input field at the bottom
- **Press Enter or Click Send** to send
- **See all users** in the left sidebar
- **View timestamps** with each message
- **Leave Room** using the button in the header
- **Auto-scroll** keeps you viewing the latest messages

## Features In Detail

### Real-Time Communication
- Messages are broadcast to all users in the room instantly
- User join/leave notifications are shown as system messages
- Live user list updates in real-time

### Room Management
- Rooms are destroyed automatically when the last user leaves
- Maximum seat limit prevents overbooking
- Unique usernames per room prevent confusion
- Room data is stored in memory on the server

### Input Validation
```
Username constraints:
- 2-30 characters
- Letters, numbers, hyphens, underscores only
- Must be unique within a room

Room ID constraints:
- 2-50 characters
- Letters, numbers, hyphens, underscores only
- Must be unique across all rooms

Message constraints:
- Max 500 characters
- Cannot be empty
- Special characters are escaped for safety
```

### Security Features
- XSS Protection: All text is escaped before display
- Input validation on client and server
- WebSocket connection validation
- Graceful error handling

## Server Architecture

### In-Memory Room Structure
```javascript
rooms = {
    "room-id-1": {
        maxSeats: 10,
        createdAt: Date,
        users: ["user1", "user2"]
    },
    "room-id-2": {
        maxSeats: 5,
        createdAt: Date,
        users: ["user3"]
    }
}
```

### Socket.IO Events

**Client → Server:**
- `createRoom` - Create a new room
- `joinRoom` - Join an existing room
- `sendMessage` - Send a message to the room
- `leaveRoom` - Leave the current room

**Server → Client:**
- `roomState` - Initial room state when joining
- `newMessage` - New message from another user
- `userJoined` - Notification when user joins
- `userLeft` - Notification when user leaves

## Troubleshooting

### "npm is not recognized"
- **Solution:** Node.js is not installed or not in PATH. Reinstall Node.js and restart terminal.

### "Cannot find module 'express'"
- **Solution:** Run `npm install` in the chat-app directory

### Port 3000 already in use
- **Solution:** Kill the process or use a different port:
  ```powershell
  $env:PORT=3001; node server.js
  ```

### Room seems to disconnect
- **Solution:** Check your internet connection and browser console for errors (F12)

### Messages not sending
- **Solution:** 
  - Check message is not empty
  - Check message is less than 500 characters
  - Check you're still connected (watch for status messages)

## Performance Notes

- **In-Memory Storage:** Room data is stored in RAM. Data is lost if server restarts.
- **Scalability:** This setup is ideal for small to medium-sized usage. For production with many rooms, consider using a database.
- **Connection Limit:** Single server can handle ~100-200 concurrent connections depending on hardware.

## Production Considerations

For deployment to production, consider:

1. **Database Replacement** - Replace in-memory storage with MongoDB/PostgreSQL
2. **Message History** - Store messages in a database
3. **Authentication** - Add user accounts and authentication
4. **Redis Support** - Use Redis adapter for Socket.IO to scale horizontally
5. **HTTPS/WSS** - Use SSL certificates for secure connections
6. **Rate Limiting** - Add rate limiting to prevent spam
7. **Monitoring** - Add logging and error tracking
8. **Environment Variables** - Use .env files for configuration

## Example Environment File (.env)

Create a `.env` file (optional):
```
PORT=3000
NODE_ENV=development
MAX_USERS_PER_ROOM=100
MESSAGE_MAX_LENGTH=500
```

Update `server.js` to use dotenv if needed:
```javascript
require('dotenv').config();
const PORT = process.env.PORT || 3000;
```

## Common Customizations

### Change Default Port
Edit `server.js` line ~95:
```javascript
const PORT = process.env.PORT || 3000; // Change 3000 to your port
```

### Change Message Length Limit
Edit `server.js` line ~180 and `chat.js` line ~130:
```javascript
if (trimmedMessage.length > 500) { // Change 500 to your limit
```

### Change Maximum Room Size
Edit `server.js` line ~111:
```javascript
if (maxSeats < 1 || maxSeats > 100) { // Change 100 to your limit
```

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

ISC

## Support

For issues or questions, check:
1. Browser console (F12) for errors
2. Server console for connection logs
3. Verify Node.js and npm are installed
4. Ensure port 3000 is not blocked by firewall

## Future Enhancements

Ideas for extending this project:
- Private messages between users
- Room password protection
- File sharing
- Message persistence with database
- User authentication
- Message editing/deletion
- Typing indicators
- User profiles with avatars
- Message search functionality
- Room categories and discovery
- Video/audio calling

---
<!-- 
cd "c:\Users\LENOVO\Desktop\vit_cord"
git status
git add .
git commit -m "fixed room chat option"
git push origin main

-->


**Happy Chatting! 🚀**
