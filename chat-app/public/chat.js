/**
 * Chat page client-side logic
 * Handles real-time messaging, user list updates, and room state management
 */

// Initialize Socket.IO connection
const socket = io();

// Data
let currentUsername = '';
let currentRoomId = '';
let maxSeats = 0;
let isLoaded = false;

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

/**
 * Initialize the chat page
 */
function initializePage() {
    // Get room info from session storage
    currentUsername = sessionStorage.getItem('username');
    currentRoomId = sessionStorage.getItem('roomId');

    // Validate session
    if (!currentUsername || !currentRoomId) {
        window.location.href = 'index.html';
        return;
    }

    isLoaded = true;
    console.log(`Initialized chat for user: ${currentUsername} in room: ${currentRoomId}`);
    connectToRoom();
}

/**
 * Join/create the room using the same socket that powers chat messaging.
 */
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

    // Default behavior is join; supports fresh "join" flow and reconnect via page open.
    socket.emit('joinRoom', {
        username: currentUsername,
        roomId: currentRoomId,
        password: pendingPassword
    }, done);
}

/**
 * Format time to display in messages
 */
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Add a message to the chat
 */
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

/**
 * Scroll messages to bottom
 */
function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight;
}

/**
 * Update users list
 */
function updateUsersList(users) {
    usersList.innerHTML = '';
    userCount.textContent = users.length;

    users.forEach(username => {
        const userEl = document.createElement('div');
        userEl.className = 'user-item';
        userEl.textContent = username;
        usersList.appendChild(userEl);
    });
}

/**
 * Update room info display
 */
function updateRoomInfo() {
    const usersCount = document.querySelectorAll('.user-item').length;
    roomTitle.textContent = currentRoomId;
    roomInfo.textContent = `Users: ${usersCount}/${maxSeats}`;
}

/**
 * Show status message
 */
function showStatus(message, duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';

    if (duration > 0) {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, duration);
    }
}

/**
 * Clear chat messages
 */
function clearMessages() {
    messagesList.innerHTML = '';
}

/**
 * Handle message form submission
 */
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const message = messageInput.value.trim();

    // Validation
    if (message.length === 0) {
        return;
    }

    if (message.length > 500) {
        showStatus('Message is too long (max 500 characters)', 3000);
        return;
    }

    // Emit message
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

/**
 * Handle character count in message input
 */
messageInput.addEventListener('input', (e) => {
    const length = e.target.value.length;
    charCount.textContent = `${length}/500`;

    // Change color if approaching limit
    if (length > 400) {
        charCount.style.color = '#dc2626';
    } else {
        charCount.style.color = 'var(--text-secondary)';
    }
});

/**
 * Handle Leave Room button
 */
leaveBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the room?')) {
        socket.emit('leaveRoom');
        // Clear session storage
        sessionStorage.removeItem('username');
        sessionStorage.removeItem('roomId');
        // Redirect to home page
        window.location.href = 'index.html';
    }
});

/**
 * Socket.IO Events
 */

/**
 * Room state - Received when user joins/creates room
 */
socket.on('roomState', (data) => {
    maxSeats = data.maxSeats;
    updateRoomInfo();
    updateUsersList(data.users);

    const message = `You joined the room (${data.currentUsers}/${data.maxSeats})`;
    addMessage('System', message, new Date(), true);
});

/**
 * New message - Received when anyone sends a message
 */
socket.on('newMessage', (data) => {
    addMessage(data.username, data.message, data.timestamp);
});

/**
 * User joined - Received when a user joins the room
 */
socket.on('userJoined', (data) => {
    updateUsersList(data.users);
    updateRoomInfo();
    const message = `${escapeHtml(data.username)} joined the room`;
    addMessage('System', message, data.timestamp, true);
});

/**
 * User left - Received when a user leaves the room
 */
socket.on('userLeft', (data) => {
    updateUsersList(data.users);
    updateRoomInfo();
    const message = `${escapeHtml(data.username)} left the room`;
    addMessage('System', message, data.timestamp, true);
});

/**
 * Socket disconnect
 */
socket.on('disconnect', () => {
    showStatus('Connection lost. Please refresh the page.', 0);
    leaveBtn.disabled = true;
    messageForm.style.opacity = '0.5';
    messageForm.style.pointerEvents = 'none';
});

/**
 * Socket connection error
 */
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showStatus('Connection error. Trying to reconnect...', 0);
});

/**
 * Socket reconnect
 */
socket.on('reconnect', () => {
    showStatus('Reconnected to server', 3000);
    leaveBtn.disabled = false;
    messageForm.style.opacity = '1';
    messageForm.style.pointerEvents = 'auto';
});

// Initialize the page
window.addEventListener('load', initializePage);

// Handle page close/tab close
window.addEventListener('beforeunload', () => {
    if (isLoaded) {
        socket.emit('leaveRoom');
    }
});

// Allow message input to focus on page load
messageInput.focus();
