const socket = io();

let localStream = null;
let peerConnection = null;
let partnerSocketId = null;
let started = false;
let muted = false;
let cameraOff = false;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const randomLocalVideo = document.getElementById('randomLocalVideo');
const randomRemoteVideo = document.getElementById('randomRemoteVideo');
const randomPartnerLabel = document.getElementById('randomPartnerLabel');
const randomStatus = document.getElementById('randomStatus');
const randomVideos = document.querySelector('.random-videos');
const maximizeRemoteBtn = document.getElementById('maximizeRemoteBtn');
const randomChatList = document.getElementById('randomChatList');
const randomChatForm = document.getElementById('randomChatForm');
const randomChatInput = document.getElementById('randomChatInput');
const randomChatSendBtn = document.getElementById('randomChatSendBtn');

const randomStartBtn = document.getElementById('randomStartBtn');
const randomNextBtn = document.getElementById('randomNextBtn');
const randomMuteBtn = document.getElementById('randomMuteBtn');
const randomCameraBtn = document.getElementById('randomCameraBtn');
const randomStopBtn = document.getElementById('randomStopBtn');

let videoLayoutMode = 'split'; // split | remote-max

function setStatus(message) {
    randomStatus.textContent = message;
}

function applyVideoLayoutMode() {
    randomVideos.classList.remove('layout-local-max', 'layout-remote-max');
    if (videoLayoutMode === 'remote-max') {
        randomVideos.classList.add('layout-remote-max');
    }

    maximizeRemoteBtn.textContent = videoLayoutMode === 'remote-max' ? 'Restore' : 'Maximize';
}

function setControls(active) {
    randomStartBtn.disabled = active;
    randomNextBtn.disabled = !active;
    randomMuteBtn.disabled = !active;
    randomCameraBtn.disabled = !active;
    randomStopBtn.disabled = !active;
}

function setRandomChatAvailability(enabled) {
    randomChatSendBtn.disabled = !enabled;
    randomChatInput.disabled = !enabled;
}

function clearPeer() {
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch (error) {
            console.warn('Peer close error:', error);
        }
    }
    peerConnection = null;
    partnerSocketId = null;
    randomRemoteVideo.srcObject = null;
    randomPartnerLabel.textContent = 'Stranger';
    setRandomChatAvailability(false);
}

function clearRandomChat() {
    randomChatList.innerHTML = '';
}

function addRandomMessage(sender, message, timestamp, mine = false) {
    const item = document.createElement('div');
    item.className = mine ? 'random-chat-item mine' : 'random-chat-item';
    const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    item.innerHTML = `
        <div class="random-chat-meta">${sender} ${time ? `• ${time}` : ''}</div>
        <div class="random-chat-text"></div>
    `;
    item.querySelector('.random-chat-text').textContent = message;
    randomChatList.appendChild(item);
    randomChatList.scrollTop = randomChatList.scrollHeight;
}

function createPeerConnection() {
    if (peerConnection) return peerConnection;

    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
        if (!event.candidate || !partnerSocketId) return;
        socket.emit('randomIceCandidate', {
            targetSocketId: partnerSocketId,
            candidate: event.candidate
        });
    };

    peerConnection.ontrack = (event) => {
        const stream = event.streams && event.streams[0];
        if (stream) {
            randomRemoteVideo.srcObject = stream;
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(peerConnection.connectionState)) {
            clearPeer();
            if (started) {
                setStatus('Connection lost. Click Next Stranger to continue.');
            }
        }
    };

    if (localStream) {
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });
    }

    return peerConnection;
}

async function ensureMedia() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        randomLocalVideo.srcObject = localStream;
        return true;
    } catch (error) {
        console.error('Media access error:', error);
        setStatus('Microphone/Camera permission denied.');
        return false;
    }
}

async function startRandom() {
    if (started) return;

    const ok = await ensureMedia();
    if (!ok) return;

    // Set active state before emitting to avoid race:
    // server may emit randomMatched before join callback returns.
    started = true;
    muted = false;
    cameraOff = false;
    randomMuteBtn.textContent = 'Mute Mic';
    randomCameraBtn.textContent = 'Turn Camera Off';
    setControls(true);
    setRandomChatAvailability(false);
    setStatus('Looking for a stranger...');

    socket.emit('randomJoin', {}, (response) => {
        if (!response || !response.success) {
            started = false;
            setControls(false);
            setRandomChatAvailability(false);
            setStatus('Failed to start random chat.');
            return;
        }
    });
}

function stopRandom() {
    if (!started) return;
    socket.emit('randomLeave');
    started = false;
    setControls(false);
    clearPeer();
    clearRandomChat();
    setStatus('Random chat stopped.');
}

function handleNext() {
    if (!started) return;
    clearPeer();
    clearRandomChat();
    setStatus('Finding next stranger...');
    socket.emit('randomNext');
}

randomStopBtn.addEventListener('click', () => {
    stopRandom();
});

randomStartBtn.addEventListener('click', () => {
    startRandom();
});

randomNextBtn.addEventListener('click', () => {
    handleNext();
});

randomMuteBtn.addEventListener('click', () => {
    if (!localStream) return;
    muted = !muted;
    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
    });
    randomMuteBtn.textContent = muted ? 'Unmute Mic' : 'Mute Mic';
});

randomCameraBtn.addEventListener('click', () => {
    if (!localStream) return;
    cameraOff = !cameraOff;
    localStream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraOff;
    });
    randomCameraBtn.textContent = cameraOff ? 'Turn Camera On' : 'Turn Camera Off';
});

maximizeRemoteBtn.addEventListener('click', () => {
    videoLayoutMode = videoLayoutMode === 'remote-max' ? 'split' : 'remote-max';
    applyVideoLayoutMode();
});

socket.on('randomWaiting', () => {
    if (!started) return;
    setRandomChatAvailability(false);
    setStatus('Waiting for a stranger...');
});

socket.on('randomMatched', async (data) => {
    if (!started) return;

    partnerSocketId = data.partnerSocketId;
    randomPartnerLabel.textContent = data.partnerName || 'Stranger';
    setStatus(`Connected with ${data.partnerName || 'Stranger'}`);
    setRandomChatAvailability(true);
    randomChatInput.focus();

    const pc = createPeerConnection();
    if (data.initiator) {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('randomOffer', {
                targetSocketId: partnerSocketId,
                offer
            });
        } catch (error) {
            console.error('Offer create error:', error);
            setStatus('Failed to start media connection.');
        }
    }
});

socket.on('randomOffer', async (data) => {
    if (!started) return;
    partnerSocketId = data.fromSocketId;
    randomPartnerLabel.textContent = data.fromUsername || 'Stranger';
    setRandomChatAvailability(true);

    try {
        const pc = createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('randomAnswer', {
            targetSocketId: partnerSocketId,
            answer
        });
    } catch (error) {
        console.error('Offer handle error:', error);
    }
});

socket.on('randomAnswer', async (data) => {
    if (data && data.fromSocketId) {
        partnerSocketId = data.fromSocketId;
        setRandomChatAvailability(true);
    }
    if (!peerConnection) return;
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
        console.error('Answer handle error:', error);
    }
});

socket.on('randomIceCandidate', async (data) => {
    if (!peerConnection) return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('ICE handle error:', error);
    }
});

socket.on('randomDisconnected', () => {
    clearPeer();
    clearRandomChat();
    if (started) {
        setStatus('Stranger disconnected. Click Next Stranger.');
    }
});

socket.on('randomNewMessage', (data) => {
    const mine = data.fromSocketId === socket.id;
    const sender = mine ? 'You' : (data.fromUsername || 'Stranger');
    addRandomMessage(sender, data.message, data.timestamp, mine);
});

randomChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!partnerSocketId) {
        setStatus('No active stranger. Click Next Stranger.');
        return;
    }
    const message = randomChatInput.value.trim();
    if (!message) return;

    randomChatSendBtn.disabled = true;
    let acked = false;
    const ackTimeout = setTimeout(() => {
        if (!acked) {
            randomChatSendBtn.disabled = false;
            setStatus('Message timeout. Try again.');
        }
    }, 5000);

    socket.emit('randomSendMessage', { message }, (response) => {
        acked = true;
        clearTimeout(ackTimeout);
        randomChatSendBtn.disabled = false;
        if (response && response.success) {
            randomChatInput.value = '';
            randomChatInput.focus();
        } else {
            setStatus((response && response.message) || 'Failed to send message');
        }
    });
});

window.addEventListener('beforeunload', () => {
    if (started) {
        socket.emit('randomLeave');
    }
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
    }
});

async function bootstrapRandomChat() {
    setStatus('Preparing video chat...');
    applyVideoLayoutMode();
    await startRandom();
}

bootstrapRandomChat();
