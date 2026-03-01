/**
 * Client-side logic for room creation and joining
 * Handles user interaction on the index page
 */

// Initialize Socket.IO connection for public room listing
const socket = io();

// DOM Elements
const privateJoinForm = document.getElementById('privateJoinForm');
const privateJoinUsername = document.getElementById('privateJoinUsername');
const privateJoinRoomId = document.getElementById('privateJoinRoomId');
const privateJoinPassword = document.getElementById('privateJoinPassword');
const createForm = document.getElementById('createForm');
const createUsername = document.getElementById('createUsername');
const createRoomId = document.getElementById('createRoomId');
const maxSeats = document.getElementById('maxSeats');
const createPassword = document.getElementById('createPassword');
const createPasswordGroup = document.getElementById('createPasswordGroup');
const roomTypeInputs = document.querySelectorAll('input[name="roomType"]');
const publicRoomsList = document.getElementById('publicRoomsList');
const errorMessage = document.getElementById('errorMessage');
const tabBtns = document.querySelectorAll('.tab-btn');
const landingChoices = document.getElementById('landingChoices');
const roomFlow = document.getElementById('roomFlow');
const showJoinRoomFlowBtn = document.getElementById('showJoinRoomFlowBtn');
const backToChoicesBtn = document.getElementById('backToChoicesBtn');
const openRandomChatBtn = document.getElementById('openRandomChatBtn');

function showRoomFlow() {
    landingChoices.style.display = 'none';
    roomFlow.style.display = 'block';
}

function showLandingChoices() {
    roomFlow.style.display = 'none';
    landingChoices.style.display = 'block';
    hideError();
}

// Tab Switching Functionality
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');

        // Remove active state from all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

        // Add active state to clicked tab
        btn.classList.add('active');
        document.getElementById(tabName).classList.add('active');

        // Clear error message
        hideError();
    });
});

/**
 * Show error message
 */
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    // Auto hide after 5 seconds
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

/**
 * Hide error message
 */
function hideError() {
    errorMessage.style.display = 'none';
}

function getSelectedRoomType() {
    const selected = document.querySelector('input[name="roomType"]:checked');
    return selected ? selected.value : 'public';
}

function setCreatePasswordVisibility() {
    const roomType = getSelectedRoomType();
    createPasswordGroup.style.display = roomType === 'private' ? 'block' : 'none';
    createPassword.required = roomType === 'private';
    if (roomType !== 'private') {
        createPassword.value = '';
    }
}

/**
 * Validate username
 */
function validateUsername(username) {
    if (!username || username.trim().length === 0) {
        return { valid: false, message: 'Username cannot be empty' };
    }
    if (username.trim().length < 2) {
        return { valid: false, message: 'Username must be at least 2 characters' };
    }
    if (username.length > 30) {
        return { valid: false, message: 'Username must be less than 30 characters' };
    }
    // Check for invalid characters
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return { valid: false, message: 'Username can only contain letters, numbers, hyphens, and underscores' };
    }
    return { valid: true };
}

/**
 * Validate room ID
 */
function validateRoomId(roomId) {
    if (!roomId || roomId.trim().length === 0) {
        return { valid: false, message: 'Room ID cannot be empty' };
    }
    if (roomId.trim().length < 2) {
        return { valid: false, message: 'Room ID must be at least 2 characters' };
    }
    if (roomId.length > 50) {
        return { valid: false, message: 'Room ID must be less than 50 characters' };
    }
    // Check for invalid characters
    if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) {
        return { valid: false, message: 'Room ID can only contain letters, numbers, hyphens, and underscores' };
    }
    return { valid: true };
}

function validatePassword(password) {
    if (!password || password.trim().length < 4) {
        return { valid: false, message: 'Password must be at least 4 characters' };
    }
    if (password.length > 50) {
        return { valid: false, message: 'Password must be less than 50 characters' };
    }
    return { valid: true };
}

/**
 * Disable form buttons during submission
 */
function setFormSubmitting(form, isSubmitting) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = isSubmitting;
    const defaultLabel = form.id === 'createForm' ? 'Create Room' : 'Join Private Room';
    button.textContent = isSubmitting ? 'Connecting...' : defaultLabel;
}

function formatCreatedAt(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleString();
}

function activateTab(tabName) {
    showRoomFlow();
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const selectedTab = document.getElementById(tabName);
    if (selectedBtn && selectedTab) {
        selectedBtn.classList.add('active');
        selectedTab.classList.add('active');
    }
}

function joinPublicRoom(roomId) {
    activateTab('join-tab');

    const enteredName = window.prompt('Name to be shown:', '');
    if (enteredName === null) {
        return;
    }

    const username = enteredName.trim();
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
        showError(usernameValidation.message);
        return;
    }

    sessionStorage.setItem('username', username);
    sessionStorage.setItem('roomId', roomId);
    sessionStorage.setItem('pendingAction', 'join');
    sessionStorage.setItem('pendingPassword', '');
    sessionStorage.removeItem('pendingMaxSeats');
    sessionStorage.removeItem('pendingIsPublic');
    window.location.href = 'chat.html';
}

function renderPublicRooms(rooms) {
    publicRoomsList.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        publicRoomsList.innerHTML = '<p class="empty-state">No public rooms yet.</p>';
        return;
    }

    rooms.forEach((room) => {
        const roomEl = document.createElement('div');
        roomEl.className = 'public-room-item';
        roomEl.innerHTML = `
            <div class="public-room-meta">
                <div class="public-room-id">${room.roomId}</div>
                <div class="public-room-info">${room.currentUsers}/${room.maxSeats} users • Created ${formatCreatedAt(room.createdAt)}</div>
            </div>
            <button type="button" class="btn btn-public-join">Join</button>
        `;

        const joinBtn = roomEl.querySelector('.btn-public-join');
        joinBtn.addEventListener('click', () => joinPublicRoom(room.roomId));
        publicRoomsList.appendChild(roomEl);
    });
}

/**
 * Handle Private Join Form Submission
 */
privateJoinForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = privateJoinUsername.value.trim();
    const roomId = privateJoinRoomId.value.trim();
    const password = privateJoinPassword.value;

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
        showError(usernameValidation.message);
        return;
    }

    const roomIdValidation = validateRoomId(roomId);
    if (!roomIdValidation.valid) {
        showError(roomIdValidation.message);
        return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
        showError(passwordValidation.message);
        return;
    }

    hideError();
    setFormSubmitting(privateJoinForm, true);

    sessionStorage.setItem('username', username);
    sessionStorage.setItem('roomId', roomId);
    sessionStorage.setItem('pendingAction', 'join');
    sessionStorage.setItem('pendingPassword', password);
    sessionStorage.removeItem('pendingMaxSeats');
    sessionStorage.removeItem('pendingIsPublic');
    window.location.href = 'chat.html';
});

/**
 * Handle Create Room Form Submission
 */
createForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = createUsername.value.trim();
    const roomId = createRoomId.value.trim();
    const maxSeatsValue = parseInt(maxSeats.value);
    const roomType = getSelectedRoomType();
    const isPublic = roomType === 'public';
    const password = createPassword.value;

    // Validation
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
        showError(usernameValidation.message);
        return;
    }

    const roomIdValidation = validateRoomId(roomId);
    if (!roomIdValidation.valid) {
        showError(roomIdValidation.message);
        return;
    }

    if (maxSeatsValue < 1 || maxSeatsValue > 100) {
        showError('Maximum seats must be between 1 and 100');
        return;
    }

    if (!isPublic) {
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            showError(passwordValidation.message);
            return;
        }
    }

    hideError();
    setFormSubmitting(createForm, true);

    // Persist intent; actual room creation happens from chat.js on the active chat socket
    sessionStorage.setItem('username', username);
    sessionStorage.setItem('roomId', roomId);
    sessionStorage.setItem('pendingAction', 'create');
    sessionStorage.setItem('pendingMaxSeats', String(maxSeatsValue));
    sessionStorage.setItem('pendingIsPublic', String(isPublic));
    sessionStorage.setItem('pendingPassword', isPublic ? '' : password);
    window.location.href = 'chat.html';
});

roomTypeInputs.forEach((input) => {
    input.addEventListener('change', setCreatePasswordVisibility);
});

showJoinRoomFlowBtn.addEventListener('click', () => {
    showRoomFlow();
    activateTab('join-tab');
});

backToChoicesBtn.addEventListener('click', () => {
    showLandingChoices();
});

openRandomChatBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Camera/Microphone is not supported in this browser.');
        return;
    }

    try {
        // Ask camera and microphone permission together.
        const preflightStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        preflightStream.getTracks().forEach((track) => track.stop());
    } catch (error) {
        showError('Camera and microphone permission is required for Video Chat.');
        return;
    }

    sessionStorage.removeItem('randomDisplayName');
    window.location.href = 'random.html';
});

socket.on('publicRooms', (rooms) => {
    renderPublicRooms(rooms);
});

socket.on('connect_error', () => {
    showError('Connection error. Unable to load public rooms.');
});

setCreatePasswordVisibility();
showLandingChoices();
