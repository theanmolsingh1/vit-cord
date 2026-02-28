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

const randomUsername = document.getElementById('randomUsername');
const randomLocalVideo = document.getElementById('randomLocalVideo');
const randomRemoteVideo = document.getElementById('randomRemoteVideo');
const randomPartnerLabel = document.getElementById('randomPartnerLabel');
const randomStatus = document.getElementById('randomStatus');

const randomStartBtn = document.getElementById('randomStartBtn');
const randomNextBtn = document.getElementById('randomNextBtn');
const randomMuteBtn = document.getElementById('randomMuteBtn');
const randomCameraBtn = document.getElementById('randomCameraBtn');
const randomStopBtn = document.getElementById('randomStopBtn');

function setStatus(message) {
    randomStatus.textContent = message;
}

function setControls(active) {
    randomStartBtn.disabled = active;
    randomNextBtn.disabled = !active;
    randomMuteBtn.disabled = !active;
    randomCameraBtn.disabled = !active;
    randomStopBtn.disabled = !active;
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

    const username = (randomUsername.value || '').trim();
    socket.emit('randomJoin', { username }, (response) => {
        if (!response || !response.success) {
            setStatus('Failed to start random chat.');
            return;
        }
        started = true;
        muted = false;
        cameraOff = false;
        randomMuteBtn.textContent = 'Mute Mic';
        randomCameraBtn.textContent = 'Turn Camera Off';
        setControls(true);
        setStatus('Looking for a stranger...');
    });
}

function stopRandom() {
    if (!started) return;
    socket.emit('randomLeave');
    started = false;
    setControls(false);
    clearPeer();
    setStatus('Random chat stopped.');
}

function handleNext() {
    if (!started) return;
    clearPeer();
    setStatus('Finding next stranger...');
    socket.emit('randomNext');
}

randomStartBtn.addEventListener('click', () => {
    startRandom();
});

randomStopBtn.addEventListener('click', () => {
    stopRandom();
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

socket.on('randomWaiting', () => {
    if (!started) return;
    setStatus('Waiting for a stranger...');
});

socket.on('randomMatched', async (data) => {
    if (!started) return;

    partnerSocketId = data.partnerSocketId;
    randomPartnerLabel.textContent = data.partnerName || 'Stranger';
    setStatus(`Connected with ${data.partnerName || 'Stranger'}`);

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
    if (started) {
        setStatus('Stranger disconnected. Click Next Stranger.');
    }
});

window.addEventListener('beforeunload', () => {
    if (started) {
        socket.emit('randomLeave');
    }
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
    }
});
