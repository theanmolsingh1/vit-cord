# VibelyVerse

VibelyVerse is a multi-mode real-time communication platform with:
- Room Chat (public/private rooms)
- Random 1:1 Video Chat
- Ranters (college-based weekly text feed)

## Tech Stack

- Frontend: HTML5, CSS3, Vanilla JavaScript
- Realtime Layer: Socket.IO
- Voice/Video: WebRTC (getUserMedia, RTCPeerConnection, ICE/STUN)
- Backend: Node.js + Express.js
- Database: PostgreSQL (Render Postgres) via `pg`
- State (client): `sessionStorage`
- Deployment: Render Web Service + Render Postgres
- Integrations: Google AdSense script, Spline 3D background

## Core Features

### 1) Room Chat
- Create room with seat limit
- Room visibility modes:
  - Public room (discoverable)
  - Private room (password-protected)
- Join public room from live room list
- Join private room with room ID + password
- Real-time room messaging and user presence updates

### 2) Room Voice/Video
- Optional user-controlled AV join (no forced auto camera/mic open)
- Peer connection signaling through Socket.IO:
  - `webrtcOffer`
  - `webrtcAnswer`
  - `webrtcIceCandidate`
- In-room AV controls:
  - Enable AV
  - Mute/unmute mic
  - Camera on/off
  - Stop AV

### 3) Random Video Chat
- Automatic random stranger matching queue
- Next stranger flow
- Start/Stop controls
- Remote-camera maximize toggle
- Right-side text chat strip for matched stranger

Random signaling events:
- `randomJoin`
- `randomNext`
- `randomLeave`
- `randomOffer`
- `randomAnswer`
- `randomIceCandidate`
- `randomSendMessage`

### 4) Ranters (College Feed)
- Third landing mode dedicated to college communities
- College discovery/search
- Add college if not available
- Enter selected college and view posts from last 7 days
- Post text messages with display name
- Emoji picker in compose area
- Chat-style interface for college feed

API endpoints:
- `GET /api/ranters/colleges`
- `POST /api/ranters/colleges`
- `GET /api/ranters/posts?college=<name>`
- `POST /api/ranters/posts`

## Overperformance Criteria (Resume-Oriented)

Use these as “overperformance”/impact points:

1. Feature breadth beyond a basic chat app:
- Delivered text chat + private/public rooms + random video chat + college feed in one project.

2. Realtime architecture depth:
- Implemented two signaling pipelines (room AV + random AV) and separate state handling for each mode.

3. Reliability and user control:
- AV access is explicit and user-driven in rooms.
- Random mode supports start/stop/next and reconnection-friendly flows.

4. Production deployment readiness:
- Integrated managed Postgres on Render with environment-based configuration.
- Added DB-backed persisted community feed (weekly windowed retrieval).

5. UI/UX polish:
- Responsive cross-device layouts.
- 3D animated landing page with distinct mode entry points.
- Dedicated dark theme consistency across communication surfaces.

## Data Model (Ranters)

Tables auto-initialized on server start (if `DATABASE_URL` exists):

- `ranter_colleges`
  - `id`, `name`, `created_at`
- `ranter_posts`
  - `id`, `college_id`, `author`, `message`, `created_at`

Weekly feed filter:
- `created_at >= NOW() - INTERVAL '7 days'`

## Local Development

```powershell
cd "c:\Users\LENOVO\Desktop\vit_cord\chat-app"
npm install
npm start
```

Open:
- `http://localhost:3000`

## Render Deployment

1. Create Render Postgres.
2. Set web service env var:
- `DATABASE_URL=<render_internal_database_url>`
3. Deploy latest commit.
4. Verify logs show Ranters DB init success.

## Environment

Required for Ranters persistence:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>
NODE_ENV=production
PORT=3000
```

## Resume Summary Snippet

Built **VibelyVerse**, a full-stack real-time communication platform using **Node.js, Express, Socket.IO, WebRTC, and PostgreSQL (Render)** with public/private room chat, random 1:1 video chat, and a college-based weekly social feed (Ranters), including production deployment and persistent data architecture.
