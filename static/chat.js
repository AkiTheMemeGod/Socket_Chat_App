let myUsername = document.querySelector('.user-label')?.textContent?.replace('👤', '').trim();

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}

// Set my avatar in sidebar
const myAvatar = document.getElementById('my-avatar');
if (myAvatar && myUsername) {
    myAvatar.textContent = getInitials(myUsername);
}

const socket = io();
let currentFriend = null;

// --- FRIEND SYSTEM ---
async function loadFriends() {
    if (window.friendStatusInterval) clearInterval(window.friendStatusInterval);

    const res = await fetch('/api/friends');
    const data = await res.json();
    // Friends
    const friendList = document.getElementById('friend-list');
    friendList.innerHTML = '';

    for (const friend of data.friends) {
        const statusRes = await fetch(`/api/last_seen?friend_id=${friend.id}`);
        const statusData = await statusRes.json();

        const li = document.createElement('li');
        li.setAttribute('data-friend-id', friend.id);

        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = getInitials(friend.username);

        const friendInfo = document.createElement('div');
        friendInfo.className = 'friend-info';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = friend.username;
        friendInfo.appendChild(nameSpan);

        const statusDiv = document.createElement('div');
        statusDiv.className = 'user-status';
        statusDiv.innerHTML = `
            <span class="status-indicator ${statusData.status === 'online' ? 'status-online' : 'status-offline'}"></span>
            ${statusData.status === 'online' ? 'Online' : statusData.last_seen}
        `;
        friendInfo.appendChild(statusDiv);

        li.appendChild(avatar);
        li.appendChild(friendInfo);
        li.onclick = () => selectFriend(friend);

        if (currentFriend && friend.id === currentFriend.id) li.classList.add('selected');
        friendList.appendChild(li);
    }
    // Pending received
    const pendingList = document.getElementById('pending-requests');
    pendingList.innerHTML = '';
    data.pending_received.forEach(friend => {
        const li = document.createElement('li');
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = getInitials(friend.username);
        li.appendChild(avatar);
        const nameSpan = document.createElement('span');
        nameSpan.textContent = friend.username;
        li.appendChild(nameSpan);
        const btn = document.createElement('button');
        btn.textContent = 'Accept';
        btn.onclick = async () => {
            await fetch('/api/accept_friend_request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_id: friend.id })
            });
            loadFriends();
        };
        li.appendChild(btn);
        pendingList.appendChild(li);
    });
    // Pending sent
    data.pending_sent.forEach(friend => {
        const li = document.createElement('li');
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = getInitials(friend.username);
        li.appendChild(avatar);
        const nameSpan = document.createElement('span');
        nameSpan.textContent = friend.username + ' (pending)';
        li.appendChild(nameSpan);
        pendingList.appendChild(li);
    });

      window.friendStatusInterval = setInterval(async () => {
    // Only update if we have friends displayed
    const friendList = document.getElementById('friend-list');
    if (friendList.children.length > 0) {
      for (const friendElement of friendList.children) {
        // Extract friend ID from the element's data attribute
        const friendId = friendElement.getAttribute('data-friend-id');
        if (friendId) {
          const statusRes = await fetch(`/api/last_seen?friend_id=${friendId}`);
          const statusData = await statusRes.json();

          // Update the status indicator
          const statusIndicator = friendElement.querySelector('.status-indicator');
          const statusText = friendElement.querySelector('.user-status');

          if (statusIndicator) {
            statusIndicator.className = `status-indicator ${statusData.status === 'online' ? 'status-online' : 'status-offline'}`;
          }

          if (statusText) {
            statusText.innerHTML = `
              <span class="status-indicator ${statusData.status === 'online' ? 'status-online' : 'status-offline'}"></span>
              ${statusData.status === 'online' ? 'Online' : statusData.last_seen}
            `;
          }
        }
      }
    }
  }, 10000);

}

// --- SEARCH USERS ---
const searchInput = document.getElementById('search-user-input');
const searchResults = document.getElementById('search-results');
let searchTimeout = null;
searchInput.oninput = function() {
    clearTimeout(searchTimeout);
    const query = this.value.trim();
    if (!query) {
        searchResults.innerHTML = '';
        return;
    }
    searchTimeout = setTimeout(async () => {
        const res = await fetch('/api/search_users?query=' + encodeURIComponent(query));
        const users = await res.json();
        searchResults.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.textContent = user.username;
            div.onclick = async () => {
                await fetch('/api/send_friend_request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ friend_id: user.id })
                });
                searchResults.innerHTML = 'Friend request sent!';
                loadFriends();
            };
            searchResults.appendChild(div);
        });
    }, 300);
};

async function selectFriend(friend) {
    currentFriend = friend;
    document.getElementById('chat-header').textContent = friend.username;
    document.querySelectorAll('#friend-list li').forEach(li => {
        li.classList.toggle('selected', li.textContent === friend.username);
    });
    await loadChatHistory(friend.id);

    if (window.statusInterval) clearInterval(window.statusInterval);
    window.statusInterval = setInterval(() => updateFriendStatus(friend.id), 30000);
    document.querySelectorAll('#friend-list li').forEach(li => {
    li.setAttribute('data-friend-id', friend.id);
  });
}

function parseFileMessage(msg) {
    // For [fileid]123|image/jpeg|foo.jpg
    if (msg.file_id || msg.message?.startsWith?.('[fileid]')) {
        let file_id = msg.file_id;
        let filetype = msg.filetype;
        let filename = msg.filename;
        if (!file_id && msg.message) {
            const [, rest] = msg.message.split('[fileid]');
            [file_id, filetype, filename] = rest.split('|', 3);
        }
        return {
            url: `/file/${file_id}`,
            filetype,
            filename
        };
    }
    // For [file]/uploads/...|image/png|foo.png
    if (msg.message?.startsWith?.('[file]')) {
        const [, rest] = msg.message.split('[file]');
        const [url, filetype, filename] = rest.split('|', 3);
        return { url, filetype, filename };
    }
    return null;
}

// --- FILE UPLOAD ---
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');
attachBtn.onclick = () => fileInput.click();

fileInput.onchange = async function() {
    if (!fileInput.files.length || !currentFriend) return;
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('to', currentFriend.id);
    // Upload file to backend
    const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    if (data.file_id) {
        // Send a chat message with the file id
        socket.emit('private_message', {
            to: currentFriend.id,
            message: '',
            file_id: data.file_id,
            filetype: data.filetype,
            filename: data.filename
        });
    }
    fileInput.value = '';
};

// --- SEND/RECEIVE MESSAGES ---
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
chatForm.onsubmit = function(e) {
    e.preventDefault();
    if (!currentFriend) return;
    if (messageInput.value.trim()) {
        socket.emit('private_message', {
            to: currentFriend.id,
            message: messageInput.value
        });
        messageInput.value = '';
    }
};

// Update the loadChatHistory function to display timestamps
async function loadChatHistory(friendId) {
    const res = await fetch(`/api/chat_history?friend_id=${friendId}`);
    const data = await res.json();
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    // Fetch friend's online status
    await updateFriendStatus(friendId);

    data.messages.forEach(msg => {
        const li = document.createElement('li');
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = getInitials(msg.sender);

        const bubble = document.createElement('span');
        bubble.className = 'bubble';

        const fileInfo = parseFileMessage(msg);
        if (fileInfo) {
            if (fileInfo.filetype && fileInfo.filetype.startsWith('image/')) {
                bubble.innerHTML = `<img src="${fileInfo.url}" alt="image" style="max-width:180px;max-height:180px;border-radius:12px;">`;
            } else {
                bubble.innerHTML = `<a href="${fileInfo.url}" target="_blank" rel="noopener">${fileInfo.filename || 'Download file'}</a>`;
            }
        } else {
            bubble.textContent = msg.message;
        }

        // Add timestamp
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = msg.timestamp;
        bubble.appendChild(timeSpan);

        if (msg.sender === myUsername) {
            li.className = 'my-msg';
        } else {
            li.className = 'other-msg';
        }
        li.appendChild(avatar);
        li.appendChild(bubble);
        chatMessages.appendChild(li);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update socket.on('private_message') to use parseFileMessage
// Update the socket.on handler to include timestamps
socket.on('private_message', function(data) {
    if (!currentFriend || (data.from_id !== currentFriend.id && data.to_id !== currentFriend.id)) return;
    const chatMessages = document.getElementById('chat-messages');
    const li = document.createElement('li');
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = getInitials(data.sender);

    const bubble = document.createElement('span');
    bubble.className = 'bubble';

    const fileInfo = parseFileMessage(data);
    if (fileInfo) {
        if (fileInfo.filetype && fileInfo.filetype.startsWith('image/')) {
            bubble.innerHTML = `<img src="${fileInfo.url}" alt="image" style="max-width:180px;max-height:180px;border-radius:12px;">`;
        } else {
            bubble.innerHTML = `<a href="${fileInfo.url}" target="_blank" rel="noopener">${fileInfo.filename || 'Download file'}</a>`;
        }
    } else {
        bubble.textContent = data.message;
    }

    // Add timestamp
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = data.timestamp;
    bubble.appendChild(timeSpan);

    if (data.sender === myUsername) {
        li.className = 'my-msg';
    } else {
        li.className = 'other-msg';
    }
    li.appendChild(avatar);
    li.appendChild(bubble);
    chatMessages.appendChild(li);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

async function updateFriendStatus(friendId) {
    if (!friendId) return;

    const res = await fetch(`/api/last_seen?friend_id=${friendId}`);
    const data = await res.json();

    const chatHeader = document.getElementById('chat-header');
    // Clear existing content but keep the friend name
    const friendName = currentFriend.username;

    // Create status indicator
    chatHeader.innerHTML = `
        <span>${friendName}</span>
        <div class="user-status">
            <span class="status-indicator ${data.status === 'online' ? 'status-online' : 'status-offline'}"></span>
            ${data.status === 'online' ? 'Online' : `<span class="last-seen">${data.last_seen}</span>`}
        </div>
    `;
}
// --- INIT ---
loadFriends();

// --- THEME TOGGLE ---
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('theme-toggle');
    function setTheme(dark) {
        if (dark) {
            document.body.classList.add('dark-mode');
            if (themeToggle) themeToggle.textContent = '☀️';
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            if (themeToggle) themeToggle.textContent = '🌙';
            localStorage.setItem('theme', 'light');
        }
    }
    if (themeToggle) {
        themeToggle.onclick = () => {
            setTheme(!document.body.classList.contains('dark-mode'));
            console.log('Theme toggled!');
        };
        console.log('Theme toggle button found and handler attached.');
    }
    // On load, set theme from localStorage or system preference
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setTheme(true);
    } else {
        setTheme(false);
    }
});

