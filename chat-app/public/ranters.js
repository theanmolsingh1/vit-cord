const collegeStep = document.getElementById('collegeStep');
const feedStep = document.getElementById('feedStep');
const rantersTopHeader = document.getElementById('rantersTopHeader');
const collegeSearchInput = document.getElementById('collegeSearchInput');
const enterCollegeBtn = document.getElementById('enterCollegeBtn');
const addCollegeBtn = document.getElementById('addCollegeBtn');
const collegeList = document.getElementById('collegeList');
const collegeError = document.getElementById('collegeError');

const selectedCollegeTitle = document.getElementById('selectedCollegeTitle');
const changeCollegeBtn = document.getElementById('changeCollegeBtn');
const rantForm = document.getElementById('rantForm');
const rantMessageInput = document.getElementById('rantMessageInput');
const rantList = document.getElementById('rantList');
const rantError = document.getElementById('rantError');
const postRantBtn = document.getElementById('postRantBtn');
const rantEmojiToggleBtn = document.getElementById('rantEmojiToggleBtn');
const rantEmojiPanel = document.getElementById('rantEmojiPanel');

let colleges = [];
let selectedCollege = '';
let displayName = '';

function showError(el, message) {
    el.textContent = message;
    el.style.display = 'block';
}

function clearError(el) {
    el.style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(isoDate) {
    return new Date(isoDate).toLocaleString();
}

function validateName(name) {
    return /^[a-zA-Z0-9_-]{2,30}$/.test(name);
}

function validateCollegeName(name) {
    return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 80;
}

function validateMessage(message) {
    return typeof message === 'string' && message.trim().length >= 1 && message.trim().length <= 1000;
}

function insertEmojiAtCursor(input, emoji) {
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const original = input.value;
    const next = `${original.slice(0, start)}${emoji}${original.slice(end)}`;
    if (next.length > 1000) return;
    input.value = next;
    const cursor = start + emoji.length;
    input.setSelectionRange(cursor, cursor);
    input.focus();
}

function setChatMode(enabled) {
    if (enabled) {
        rantersTopHeader.style.display = 'none';
        collegeStep.style.display = 'none';
        feedStep.style.display = 'flex';
        return;
    }
    feedStep.style.display = 'none';
    collegeStep.style.display = 'block';
    rantersTopHeader.style.display = 'flex';
}

function ensureDisplayName() {
    const saved = (sessionStorage.getItem('rantersDisplayName') || '').trim();
    if (validateName(saved)) {
        displayName = saved;
        return true;
    }

    const enteredName = window.prompt('Name to be shown:', '');
    if (enteredName === null) return false;

    const name = enteredName.trim();
    if (!validateName(name)) {
        showError(collegeError, 'Name must be 2-30 letters, numbers, underscores or hyphens.');
        return false;
    }

    displayName = name;
    sessionStorage.setItem('rantersDisplayName', name);
    return true;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Request failed');
    }
    return data;
}

function renderCollegeList(items) {
    collegeList.innerHTML = '';
    if (!items || items.length === 0) {
        collegeList.innerHTML = '<p class="ranters-muted">No colleges found.</p>';
        return;
    }

    items.forEach((college) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'college-item';
        btn.textContent = `${college.name} (${college.posts_last_week || 0} posts this week)`;
        btn.addEventListener('click', () => {
            collegeSearchInput.value = college.name;
            handleEnterCollege();
        });
        collegeList.appendChild(btn);
    });
}

async function loadColleges(query = '') {
    clearError(collegeError);
    try {
        const data = await fetchJson(`/api/ranters/colleges${query ? `?q=${encodeURIComponent(query)}` : ''}`);
        colleges = data.colleges || [];
        renderCollegeList(colleges);
    } catch (error) {
        showError(collegeError, error.message);
    }
}

async function ensureCollegeExists(collegeName) {
    const data = await fetchJson('/api/ranters/colleges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: collegeName })
    });
    return data.college.name;
}

async function enterCollege(collegeName) {
    if (!ensureDisplayName()) return;
    selectedCollege = collegeName;
    selectedCollegeTitle.textContent = `${collegeName} - Weekly Feed`;
    setChatMode(true);
    sessionStorage.setItem('rantersCollege', collegeName);

    await loadRants();
}

async function handleEnterCollege() {
    clearError(collegeError);
    const name = collegeSearchInput.value.trim();

    if (!validateCollegeName(name)) {
        showError(collegeError, 'College name must be 2 to 80 characters.');
        return;
    }

    const found = colleges.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!found) {
        showError(collegeError, 'College not available. Click "Add Your College".');
        return;
    }

    await enterCollege(found.name);
}

async function handleAddCollege() {
    clearError(collegeError);
    const name = collegeSearchInput.value.trim();
    if (!validateCollegeName(name)) {
        showError(collegeError, 'College name must be 2 to 80 characters.');
        return;
    }

    try {
        const finalName = await ensureCollegeExists(name);
        await loadColleges();
        await enterCollege(finalName);
    } catch (error) {
        showError(collegeError, error.message);
    }
}

function renderRants(posts) {
    rantList.innerHTML = '';
    if (!posts || posts.length === 0) {
        rantList.innerHTML = '<p class="ranters-muted">No texts in the last 7 days for this college.</p>';
        return;
    }

    const ordered = [...posts].reverse();
    ordered.forEach((post) => {
        const isMine = post.author === displayName;
        const card = document.createElement('div');
        card.className = isMine ? 'rant-item rant-item-mine' : 'rant-item';
        card.innerHTML = `
            <div class="rant-head">
                <span class="rant-author">${escapeHtml(post.author)}</span>
                <span class="rant-time">${formatTime(post.created_at)}</span>
            </div>
            <div class="rant-message">${escapeHtml(post.message)}</div>
        `;
        rantList.appendChild(card);
    });

    rantList.scrollTop = rantList.scrollHeight;
}

async function loadRants() {
    clearError(rantError);
    try {
        const data = await fetchJson(`/api/ranters/posts?college=${encodeURIComponent(selectedCollege)}`);
        renderRants(data.posts || []);
    } catch (error) {
        showError(rantError, error.message);
    }
}

async function handlePostRant(e) {
    e.preventDefault();
    clearError(rantError);

    const message = rantMessageInput.value.trim();

    if (!validateName(displayName)) {
        showError(rantError, 'Invalid display name. Re-enter college and try again.');
        return;
    }
    if (!validateMessage(message)) {
        showError(rantError, 'Text must be 1 to 1000 characters.');
        return;
    }

    postRantBtn.disabled = true;
    postRantBtn.textContent = 'Posting...';
    try {
        await fetchJson('/api/ranters/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collegeName: selectedCollege,
                author: displayName,
                message
            })
        });
        rantMessageInput.value = '';
        await loadRants();
    } catch (error) {
        showError(rantError, error.message);
    } finally {
        postRantBtn.disabled = false;
        postRantBtn.textContent = 'Post';
    }
}

enterCollegeBtn.addEventListener('click', handleEnterCollege);
addCollegeBtn.addEventListener('click', handleAddCollege);

collegeSearchInput.addEventListener('input', (e) => {
    loadColleges(e.target.value.trim());
});

changeCollegeBtn.addEventListener('click', () => {
    setChatMode(false);
    selectedCollege = '';
    sessionStorage.removeItem('rantersCollege');
});

rantForm.addEventListener('submit', handlePostRant);

rantEmojiToggleBtn.addEventListener('click', () => {
    rantEmojiPanel.style.display = rantEmojiPanel.style.display === 'none' ? 'flex' : 'none';
});

document.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        insertEmojiAtCursor(rantMessageInput, btn.textContent);
    });
});

document.addEventListener('click', (e) => {
    if (!rantEmojiPanel.contains(e.target) && e.target !== rantEmojiToggleBtn) {
        rantEmojiPanel.style.display = 'none';
    }
});

window.addEventListener('load', async () => {
    setChatMode(false);
    await loadColleges();
    const savedCollege = (sessionStorage.getItem('rantersCollege') || '').trim();
    if (savedCollege) {
        collegeSearchInput.value = savedCollege;
        const matched = colleges.find((c) => c.name.toLowerCase() === savedCollege.toLowerCase());
        if (matched) {
            await enterCollege(matched.name);
        }
    }
});

setInterval(() => {
    if (selectedCollege) {
        loadRants();
    }
}, 15000);
