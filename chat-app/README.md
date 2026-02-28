# Real-Time Chat Room Application

A real-time chat application built with Node.js, Express, and Socket.IO.

## Features

- Create and join chat rooms
- Public and private room support
- Public room list visible on the home page for all users
- Private rooms protected by password
- Real-time messaging with timestamps
- Live participant list
- Room seat limits
- Input validation on client and server
- Responsive UI

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Real-time transport: Socket.IO

## Project Structure

```text
chat-app/
|-- server.js
|-- package.json
|-- public/
|   |-- index.html
|   |-- chat.html
|   |-- style.css
|   |-- client.js
|   `-- chat.js
`-- README.md
```

## Prerequisites

- Node.js 18+ (recommended)
- npm

Check installation:

```powershell
node --version
npm --version
```

## Installation

```powershell
cd "c:\Users\LENOVO\Desktop\vit_cord\chat-app"
npm install
```

## Run

```powershell
cd "c:\Users\LENOVO\Desktop\vit_cord\chat-app"
npm start
```

Open: `http://localhost:3000`

## Usage

### Create Room

1. Go to `Create Room` tab.
2. Enter username and room ID.
3. Set max seats (1-100).
4. Choose room type:
   - Public: no password required to join.
   - Private: password required to join.
5. If private, enter password (4-50 characters).
6. Click `Create Room`.

### Join Room

1. Go to `Join Room` tab.
2. Enter username and room ID.
3. Choose join type:
   - Public Room: no password asked.
   - Private Room: password required.
4. Click `Join Room`.

### Public Room Discovery

- Public rooms are shown on the home page in real time.
- Each row shows room ID, current users, max seats, and created time.
- Clicking `Join` on a public room pre-fills the Room ID in the join form.

## Validation Rules

- Username: 2-30 chars, letters/numbers/`-`/`_`
- Room ID: 2-50 chars, letters/numbers/`-`/`_`
- Message: 1-500 chars
- Private room password: 4-50 chars

## Socket Events

Client to server:

- `createRoom`
- `joinRoom`
- `sendMessage`
- `leaveRoom`

Server to client:

- `roomState`
- `newMessage`
- `userJoined`
- `userLeft`
- `publicRooms` (live public room directory)

## In-Memory Room Model

```js
rooms = {
  "room-a": {
    maxSeats: 10,
    createdAt: Date,
    users: ["alice", "bob"],
    isPublic: true,
    password: null
  },
  "room-b": {
    maxSeats: 5,
    createdAt: Date,
    users: ["sam"],
    isPublic: false,
    password: "secret123"
  }
};
```

## Troubleshooting

- `Cannot find module ...`: run `npm install` in `chat-app`.
- Port 3000 in use: run `set PORT=3001 && node server.js` (Windows CMD) or set env in PowerShell.
- `Incorrect room password`: choose `Private Room` in join form and enter exact password.
- Messages not sending: ensure you are connected and message length is <= 500.

## Notes

- Rooms are stored in memory and are removed when empty.
- Data resets when server restarts.

## License

ISC
