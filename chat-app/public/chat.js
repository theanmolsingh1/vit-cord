/**
 * Chat page client-side logic
 * Handles real-time messaging, users, and WebRTC voice/video.
 */

const socket = io();

let currentUsername = '';
let currentRoomId = '';
let maxSeats = 0;
let isLoaded = false;
let roomUsersDetailed = [];

let localStream = null;
let mediaEnabled = false;
let isMuted = false;
let isCameraOff = false;

const peerConnections = new Map();
const userBySocketId = new Map();

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM Elements
const roomTitle = document.getElementById('roomTitle');
const roomInfo = document.getElementById('roomInfo');
const messagesList = document.getElementById('messagesList');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const usersList = document.getElementById('usersList');
const userCount = document.getElementById('userCount');
const leaveBtn = document.getElementById('leaveBtn');
const statusMessage = document.getElementById('statusMessage');
const charCount = document.getElementById('charCount');

const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const enableAvBtn = document.getElementById('enableAvBtn');
const muteBtn = document.getElementById('muteBtn');
const cameraBtn = document.getElementById('cameraBtn');
const stopAvBtn = document.getElementById('stopAvBtn');

function initializePage() {
    currentUsername = sessionStorage.getItem('username');
    currentRoomId = sessionStorage.getItem('roomId');

    if (!currentUsername || !currentRoomId) {
        window.location.href = 'index.html';
        return;
    }

    isLoaded = true;
    connectToRoom();
}

function connectToRoom() {
    const pendingAction = sessionStorage.getItem('pendingAction');
    const pendingMaxSeats = parseInt(sessionStorage.getItem('pendingMaxSeats') || '10', 10);
    const pendingPassword = sessionStorage.getItem('pendingPassword') || '';
    const pendingIsPublic = sessionStorage.getItem('pendingIsPublic');
    const isPublic = pendingIsPublic !== 'false';

    const done = (response) => {
        if (response && response.success) {
            sessionStorage.removeItem('pendingAction');
            sessionStorage.removeItem('pendingMaxSeats');
            sessionStorage.removeItem('pendingPassword');
            sessionStorage.removeItem('pendingIsPublic');
            return;
        }

        const err = (response && response.message) ? response.message : 'Failed to connect to room';
        showStatus(err, 3000);
        setTimeout(() => {
            sessionStorage.removeItem('username');
            sessionStorage.removeItem('roomId');
            sessionStorage.removeItem('pendingAction');
            sessionStorage.removeItem('pendingMaxSeats');
            sessionStorage.removeItem('pendingPassword');
            sessionStorage.removeItem('pendingIsPublic');
            window.location.href = 'index.html';
        }, 1200);
    };

    if (pendingAction === 'create') {
        socket.emit('createRoom', {
            username: currentUsername,
            roomId: currentRoomId,
            maxSeats: pendingMaxSeats,
            isPublic,
            password: pendingPassword
        }, done);
        return;
    }

    socket.emit('joinRoom', {
        username: currentUsername,
        roomId: currentRoomId,
        password: pendingPassword
    }, done);
}

function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addMessage(username, message, timestamp, isSystemMessage = false) {
    const messageEl = document.createElement('div');
    messageEl.className = isSystemMessage ? 'system-message' : 'message';

    if (isSystemMessage) {
        messageEl.textContent = message;
    } else {
        const headerEl = document.createElement('div');
        headerEl.className = 'message-header';

        const usernameEl = document.createElement('span');
        usernameEl.className = 'message-username';
        usernameEl.textContent = escapeHtml(username);

        const timeEl = document.createElement('span');
        timeEl.className = 'message-time';
        timeEl.textContent = formatTime(new Date(timestamp));

        headerEl.appendChild(usernameEl);
        headerEl.appendChild(timeEl);

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.textContent = escapeHtml(message);

        messageEl.appendChild(headerEl);
        messageEl.appendChild(contentEl);
    }

    messagesList.appendChild(messageEl);
    scrollToBottom();
}

function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight;
}

function normalizeUsersDetailed(data) {
    if (Array.isArray(data.usersDetailed)) {
        return data.usersDetailed
            .filter((u) => u && u.username)
            .map((u) => ({ socketId: u.socketId || '', username: u.username }));
    }
    if (Array.isArray(data.users)) {
        return data.users.map((username) => ({ socketId: '', username }));
    }
    return [];
}

function updateUsersList(usersDetailed) {
    usersList.innerHTML = '';
    userCount.textContent = String(usersDetailed.length);

    usersDetailed.forEach((user) => {
        const userEl = document.createElement('div');
        userEl.className = 'user-item';
        userEl.textContent = user.username;
        usersList.appendChild(userEl);
    });
}

function syncUserMap(usersDetailed) {
    userBySocketId.clear();
    usersDetailed.forEach((user) => {
        if (user.socketId) {
            userBySocketId.set(user.socketId, user.username);
        }
    });
}

function updateRoomInfo() {
    const usersCount = Number(userCount.textContent || '0');
    roomTitle.textContent = currentRoomId;
    roomInfo.textContent = `Users: ${usersCount}/${maxSeats}`;
}

function showStatus(message, duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';

    if (duration > 0) {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, duration);
    }
}

function setMediaButtonState(enabled) {
    muteBtn.disabled = !enabled;
    cameraBtn.disabled = !enabled;
    stopAvBtn.disabled = !enabled;
}

async function enableVoiceVideo() {
    if (mediaEnabled) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideo.srcObject = localStream;
        mediaEnabled = true;
        isMuted = false;
        isCameraOff = false;

        enableAvBtn.disabled = true;
        enableAvBtn.textContent = 'Voice/Video Enabled';
        muteBtn.textContent = 'Mute Mic';
        cameraBtn.textContent = 'Turn Camera Off';
        setMediaButtonState(true);

        connectToExistingPeers();
        showStatus('Voice/Video enabled', 2000);
        return true;
    } catch (error) {
        console.error('Media access failed:', error);
        showStatus('Microphone/Camera access denied', 3000);
        return false;
    }
}

function stopVoiceVideo() {
    peerConnections.forEach((pc, remoteSocketId) => {
        try {
            pc.close();
        } catch (e) {
            console.warn('Failed to close peer connection:', remoteSocketId, e);
        }
        removeRemoteVideo(remoteSocketId);
    });
    peerConnections.clear();

    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;

    mediaEnabled = false;
    isMuted = false;
    isCameraOff = false;
    enableAvBtn.disabled = false;
    enableAvBtn.textContent = 'Enable Voice/Video';
    muteBtn.textContent = 'Mute Mic';
    cameraBtn.textContent = 'Turn Camera Off';
    setMediaButtonState(false);
}

function remoteCardId(socketId) {
    return `remote-card-${socketId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function upsertRemoteVideo(socketId, username, stream) {
    const cardId = remoteCardId(socketId);
    let card = document.getElementById(cardId);

    if (!card) {
        card = document.createElement('div');
        card.className = 'remote-video-card';
        card.id = cardId;

        const label = document.createElement('p');
        label.className = 'video-label';
        label.textContent = username || 'User';
        label.setAttribute('data-label', '1');

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute('data-video', '1');

        card.appendChild(label);
        card.appendChild(video);
        remoteVideos.appendChild(card);
    }

    const labelEl = card.querySelector('[data-label="1"]');
    const videoEl = card.querySelector('[data-video="1"]');
    if (labelEl) labelEl.textContent = username || 'User';
    if (videoEl && videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
    }
}

function removeRemoteVideo(socketId) {
    const card = document.getElementById(remoteCardId(socketId));
    if (card) {
        card.remove();
    }
}

function cleanupPeer(remoteSocketId) {
    const pc = peerConnections.get(remoteSocketId);
    if (pc) {
        try {
            pc.close();
        } catch (e) {
            console.warn('Peer close warning:', e);
        }
    }
    peerConnections.delete(remoteSocketId);
    removeRemoteVideo(remoteSocketId);
}

function createPeerConnection(remoteSocketId, remoteUsername) {
    const existing = peerConnections.get(remoteSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(remoteSocketId, pc);

    pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit('webrtcIceCandidate', {
            roomId: currentRoomId,
            targetSocketId: remoteSocketId,
            candidate: event.candidate
        });
    };

    pc.ontrack = (event) => {
        const stream = event.streams && event.streams[0];
        if (!stream) return;
        const username = userBySocketId.get(remoteSocketId) || remoteUsername || 'User';
        upsertRemoteVideo(remoteSocketId, username, stream);
    };

    pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
            cleanupPeer(remoteSocketId);
        }
    };

    if (localStream) {
        localStream.getTracks().forEach((track) => {
            pc.addTrack(track, localStream);
        });
    }

    return pc;
}

async function createAndSendOffer(remoteSocketId, remoteUsername) {
    if (!mediaEnabled || !remoteSocketId || remoteSocketId === socket.id) return;
    try {
        const pc = createPeerConnection(remoteSocketId, remoteUsername);
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtcOffer', {
            roomId: currentRoomId,
            targetSocketId: remoteSocketId,
            offer
        });
    } catch (error) {
        console.error('Offer error:', error);
    }
}

function connectToExistingPeers() {
    roomUsersDetailed.forEach((user) => {
        if (user.socketId && user.socketId !== socket.id) {
            createAndSendOffer(user.socketId, user.username);
        }
    });
}

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const message = messageInput.value.trim();
    if (message.length === 0) return;
    if (message.length > 500) {
        showStatus('Message is too long (max 500 characters)', 3000);
        return;
    }

    socket.emit('sendMessage', { roomId: currentRoomId, message }, (response) => {
        if (response.success) {
            messageInput.value = '';
            charCount.textContent = '0/500';
            messageInput.focus();
        } else {
            showStatus('Failed to send message', 3000);
        }
    });
});

messageInput.addEventListener('input', (e) => {
    const length = e.target.value.length;
    charCount.textContent = `${length}/500`;
    charCount.style.color = length > 400 ? '#dc2626' : 'var(--text-secondary)';
});

leaveBtn.addEventListener('click', () => {
    if (!confirm('Are you sure you want to leave the room?')) return;
    stopVoiceVideo();
    socket.emit('leaveRoom');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('roomId');
    window.location.href = 'index.html';
});

enableAvBtn.addEventListener('click', async () => {
    await enableVoiceVideo();
});

muteBtn.addEventListener('click', () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
    });
    muteBtn.textContent = isMuted ? 'Unmute Mic' : 'Mute Mic';
});

cameraBtn.addEventListener('click', () => {
    if (!localStream) return;
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks().forEach((track) => {
        track.enabled = !isCameraOff;
    });
    cameraBtn.textContent = isCameraOff ? 'Turn Camera On' : 'Turn Camera Off';
});

stopAvBtn.addEventListener('click', () => {
    stopVoiceVideo();
    showStatus('Voice/Video stopped', 2000);
});

socket.on('roomState', (data) => {
    maxSeats = data.maxSeats;
    roomUsersDetailed = normalizeUsersDetailed(data);
    syncUserMap(roomUsersDetailed);
    updateUsersList(roomUsersDetailed);
    updateRoomInfo();

    const message = `You joined the room (${data.currentUsers}/${data.maxSeats})`;
    addMessage('System', message, new Date(), true);
});

socket.on('newMessage', (data) => {
    addMessage(data.username, data.message, data.timestamp);
});

socket.on('userJoined', (data) => {
    roomUsersDetailed = normalizeUsersDetailed(data);
    syncUserMap(roomUsersDetailed);
    updateUsersList(roomUsersDetailed);
    updateRoomInfo();

    const message = `${escapeHtml(data.username)} joined the room`;
    addMessage('System', message, data.timestamp, true);

    if (mediaEnabled && data.socketId && data.socketId !== socket.id) {
        createAndSendOffer(data.socketId, data.username);
    }
});

socket.on('userLeft', (data) => {
    roomUsersDetailed = normalizeUsersDetailed(data);
    syncUserMap(roomUsersDetailed);
    updateUsersList(roomUsersDetailed);
    updateRoomInfo();

    if (data.socketId) {
        cleanupPeer(data.socketId);
    }

    const message = `${escapeHtml(data.username)} left the room`;
    addMessage('System', message, data.timestamp, true);
});

socket.on('webrtcOffer', async (data) => {
    const { fromSocketId, fromUsername, offer } = data;
    if (!fromSocketId || !offer) return;

    if (!mediaEnabled) {
        const enabled = await enableVoiceVideo();
        if (!enabled) {
            showStatus(`Incoming call from ${fromUsername || 'user'} requires mic/camera access`, 3000);
            return;
        }
    }

    try {
        userBySocketId.set(fromSocketId, fromUsername || 'User');
        const pc = createPeerConnection(fromSocketId, fromUsername || 'User');
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtcAnswer', {
            roomId: currentRoomId,
            targetSocketId: fromSocketId,
            answer
        });
    } catch (error) {
        console.error('Offer handling error:', error);
    }
});

socket.on('webrtcAnswer', async (data) => {
    const { fromSocketId, answer } = data;
    if (!fromSocketId || !answer) return;

    const pc = peerConnections.get(fromSocketId);
    if (!pc) return;

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Answer handling error:', error);
    }
});

socket.on('webrtcIceCandidate', async (data) => {
    const { fromSocketId, candidate } = data;
    if (!fromSocketId || !candidate) return;

    const pc = peerConnections.get(fromSocketId);
    if (!pc) return;

    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('ICE handling error:', error);
    }
});

socket.on('disconnect', () => {
    showStatus('Connection lost. Please refresh the page.', 0);
    leaveBtn.disabled = true;
    messageForm.style.opacity = '0.5';
    messageForm.style.pointerEvents = 'none';
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showStatus('Connection error. Trying to reconnect...', 0);
});

socket.on('reconnect', () => {
    showStatus('Reconnected to server', 3000);
    leaveBtn.disabled = false;
    messageForm.style.opacity = '1';
    messageForm.style.pointerEvents = 'auto';
});

window.addEventListener('load', initializePage);

window.addEventListener('beforeunload', () => {
    if (isLoaded) {
        stopVoiceVideo();
        socket.emit('leaveRoom');
    }
});

messageInput.focus();
