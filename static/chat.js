class ChatApp {
  constructor() {
    this.myUsername = document.querySelector('.user-label')?.textContent?.replace('👤', '').trim();
    this.socket = io();
    this.currentFriend = null;
    this.friendStatusInterval = null;
    this.groups = {};           // { groupId: {name, members, unreadCount} }
    this.currentGroup = null;   // active group object or null


    this.init();
  }

  init() {
    this.setupThemeToggle();
    this.setupEventListeners();
    this.loadFriends();
    this.setupMobileNavigation();
    this.updateChatUIState(); // Add this line

  }

  updateChatUIState() {
  const chatForm = document.getElementById('chat-form');
  const chatPlaceholder = document.getElementById('chat-placeholder');
  const chatMessages = document.getElementById('chat-messages');

  if (this.currentFriend) {
    chatForm.classList.add('active');
    chatPlaceholder.style.display = 'none';
    chatMessages.style.display = 'flex';
  } else {
    chatForm.classList.remove('active');
    chatPlaceholder.style.display = 'flex';
    chatMessages.style.display = 'none';
  }
}

  setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;

    // Get saved theme or system preference
    const savedTheme = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = savedTheme || (systemDark ? 'dark' : 'light');

    this.setTheme(currentTheme);

    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
      });
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  setTheme(theme) {
    const html = document.documentElement;
    const themeToggle = document.getElementById('theme-toggle');

    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    if (themeToggle) {
      themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    // Animate theme transition
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, 300);
  }

  setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('search-user-input');
    const searchResults = document.getElementById('search-results');

    this.socket.on('private_message', (data) => this.handleIncomingMessage(data));
    this.socket.on('messages_read', (data) => this.handleReadReceipt(data));
    // === GROUP SOCKET EVENTS ===
    this.socket.on('group_invite',   d => this.receiveGroupInvite(d));
    this.socket.on('group_created',  d => this.groupCreated(d));      // feedback to creator
    this.socket.on('member_joined',  d => this.memberJoined(d));      // someone accepted
    this.socket.on('group_message',  d => this.handleGroupMessage(d));

    let searchTimeout = null;

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (!query) {
          searchResults.innerHTML = '';
          searchResults.style.display = 'none';
          return;
        }

        searchTimeout = setTimeout(() => this.searchUsers(query), 300);
      });

      // Hide results when clicking outside
      document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
          searchResults.style.display = 'none';
        }
      });

      document.getElementById('new-group-btn')?.addEventListener('click', () => {
  const name = prompt('Group name?');
  if (!name) return;
  // choose friends to invite – for demo just invite the currently selected friend
  const members = this.currentFriend ? [this.currentFriend.id] : [];
  this.socket.emit('group_create', { name, member_ids: members });
});

    }

    // File upload
    const fileInput = document.getElementById('file-input');
    const attachBtn = document.getElementById('attach-btn');

    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }

    // Message form
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', (e) => this.sendMessage(e));
    }

  }
  async markMessagesAsRead(senderId) {
  try {
    await fetch('/api/mark_read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: senderId })
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
}

  setupMobileNavigation() {
    const chatHeader = document.getElementById('chat-header');
    const sidebar = document.querySelector('.sidebar');

    if (window.innerWidth <= 640) {
      chatHeader?.addEventListener('click', (e) => {
        if (e.target === chatHeader || e.target.matches('#chat-header::before')) {
          sidebar?.classList.toggle('open');
        }
      });
    }
  }

  getInitials(name) {
    return name.split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  async searchUsers(query) {
    try {
      const response = await fetch(`/api/search_users?query=${encodeURIComponent(query)}`);
      const users = await response.json();
      this.renderSearchResults(users);
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  renderSearchResults(users) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) return;

    searchResults.innerHTML = '';
    searchResults.style.display = users.length ? 'block' : 'none';

    users.forEach(user => {
      const div = document.createElement('div');
      div.textContent = user.username;
      div.addEventListener('click', () => this.sendFriendRequest(user.id));
      searchResults.appendChild(div);
    });
  }

  async sendFriendRequest(friendId) {
    try {
      await fetch('/api/send_friend_request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: friendId })
      });

      document.getElementById('search-results').innerHTML =
        '<div style="color: var(--success); text-align: center;">Friend request sent!</div>';

      setTimeout(() => {
        document.getElementById('search-results').style.display = 'none';
      }, 2000);

      this.loadFriends();
    } catch (error) {
      console.error('Friend request error:', error);
    }
  }

  async loadFriends() {
    try {
      if (this.friendStatusInterval) {
        clearInterval(this.friendStatusInterval);
      }

      const response = await fetch('/api/friends');
      const data = await response.json();

      await this.renderFriends(data.friends);
      this.renderPendingRequests(data.pending_received, data.pending_sent);
      this.setupFriendStatusUpdates();
    } catch (error) {
      console.error('Load friends error:', error);
    }
  }

  async renderFriends(friends) {
    const friendList = document.getElementById('friend-list');
    if (!friendList) return;

    friendList.innerHTML = '';

    for (const friend of friends) {
      const li = await this.createFriendElement(friend);
      friendList.appendChild(li);
    }
  }

  async createFriendElement(friend) {
    const statusResponse = await fetch(`/api/last_seen?friend_id=${friend.id}`);
    const statusData = await statusResponse.json();

    const li = document.createElement('li');
    li.setAttribute('data-friend-id', friend.id);
    li.addEventListener('click', () => this.selectFriend(friend));

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = this.getInitials(friend.username);

    const friendInfo = document.createElement('div');
    friendInfo.className = 'friend-info';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = friend.username;

    const statusDiv = document.createElement('div');
    statusDiv.className = 'user-status';
    statusDiv.innerHTML = `
      <span class="status-indicator ${statusData.status === 'online' ? 'status-online' : 'status-offline'}"></span>
      ${statusData.status === 'online' ? 'Online' : statusData.last_seen}
    `;

    friendInfo.appendChild(nameSpan);
    friendInfo.appendChild(statusDiv);
    li.appendChild(avatar);
    li.appendChild(friendInfo);

    if (this.currentFriend && friend.id === this.currentFriend.id) {
      li.classList.add('selected');
    }

    return li;
  }

  renderPendingRequests(pendingReceived, pendingSent) {
    const pendingList = document.getElementById('pending-requests');
    if (!pendingList) return;

    pendingList.innerHTML = '';

    // Render received requests
    pendingReceived.forEach(friend => {
      const li = document.createElement('li');

      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.textContent = this.getInitials(friend.username);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = friend.username;

      const acceptBtn = document.createElement('button');
      acceptBtn.textContent = 'Accept';
      acceptBtn.style.cssText = `
        background: var(--accent-gradient);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 0.5rem 1rem;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all var(--transition-medium);
      `;

      acceptBtn.addEventListener('click', () => this.acceptFriendRequest(friend.id));

      li.appendChild(avatar);
      li.appendChild(nameSpan);
      li.appendChild(acceptBtn);
      pendingList.appendChild(li);
    });

    // Render sent requests
    pendingSent.forEach(friend => {
      const li = document.createElement('li');

      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.textContent = this.getInitials(friend.username);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${friend.username} (pending)`;
      nameSpan.style.opacity = '0.7';

      li.appendChild(avatar);
      li.appendChild(nameSpan);
      pendingList.appendChild(li);
    });
  }

  async acceptFriendRequest(friendId) {
    try {
      await fetch('/api/accept_friend_request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: friendId })
      });

      this.loadFriends();
    } catch (error) {
      console.error('Accept friend request error:', error);
    }
  }

  async selectFriend(friend) {
  this.currentFriend = friend;

  // Update header
  const chatHeader = document.getElementById('chat-header');
  if (chatHeader) {
    chatHeader.innerHTML = `
      <div>
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${friend.username}</div>
        <div class="user-status" style="font-size: 0.875rem; font-weight: 400;">
          <span class="status-indicator status-offline"></span>
          <span>Loading...</span>
        </div>
      </div>
    `;
  }

  // Update UI state
  this.updateChatUIState();

  // Update selected state
  document.querySelectorAll('#friend-list li').forEach(li => {
    li.classList.remove('selected');
  });
  document.querySelector(`#friend-list li[data-friend-id="${friend.id}"]`)?.classList.add('selected');

  // Load chat history and update status
  await this.loadChatHistory(friend.id);
  await this.updateFriendStatus(friend.id);
  await this.markMessagesAsRead(friend.id);



  // Close mobile sidebar
  if (window.innerWidth <= 640) {
    document.querySelector('.sidebar')?.classList.remove('open');
  }
}

  async loadChatHistory(friendId) {
    try {
      const response = await fetch(`/api/chat_history?friend_id=${friendId}`);
      const data = await response.json();

      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages) {
        chatMessages.innerHTML = '';

        data.messages.forEach(message => {
          this.displayMessage(message, false);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } catch (error) {
      console.error('Load chat history error:', error);
    }
  }

  handleReadReceipt(data) {
  // Update UI for messages that were read
  if (this.currentFriend && data.reader_id === this.currentFriend.id) {
    const messageElements = document.querySelectorAll('#chat-messages li.my-msg');
    messageElements.forEach(el => {
      if (!el.querySelector('.read-receipt')) {
        const bubble = el.querySelector('.bubble');
        const readReceipt = document.createElement('span');
        readReceipt.className = 'read-receipt';
        readReceipt.innerHTML = '✓✓';
        readReceipt.title = `Read at ${data.timestamp}`;
        bubble.appendChild(readReceipt);
      }
    });
  }
}

  displayMessage(data, animate = true) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const li = document.createElement('li');
    li.className = data.sender === this.myUsername ? 'my-msg' : 'other-msg';

    if (animate) {
      li.style.animationDelay = '0.1s';
    }

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = this.getInitials(data.sender);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    // Handle file messages
    const fileInfo = this.parseFileMessage(data);
    if (fileInfo) {
      if (fileInfo.filetype?.startsWith('image/')) {
        bubble.innerHTML = `
          <img src="${fileInfo.url}" 
               alt="image" 
               style="max-width: 200px; max-height: 200px; border-radius: var(--radius-sm); margin-bottom: 0.5rem;" />
        `;
      } else {
        bubble.innerHTML = `
          <a href="${fileInfo.url}" 
             target="_blank" 
             rel="noopener noreferrer"
             style="color: inherit; text-decoration: underline;">
            ${fileInfo.filename || 'Download file'}
          </a>
        `;
      }
    } else {
      bubble.textContent = data.message;
    }

    // Add timestamp
    if (data.timestamp) {
      const timeSpan = document.createElement('div');
      timeSpan.className = 'message-time';
      timeSpan.textContent = data.timestamp;
      bubble.appendChild(timeSpan);
    }

    if (data.sender === this.myUsername && data.read) {
    const readReceipt = document.createElement('span');
    readReceipt.className = 'read-receipt';
    readReceipt.innerHTML = '✓✓';
    readReceipt.title = data.read_at ? `Read at ${data.read_at}` : 'Read';
    bubble.appendChild(readReceipt);
  }
    li.appendChild(avatar);
    li.appendChild(bubble);
    chatMessages.appendChild(li);

    if (animate) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  parseFileMessage(msg) {
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

    if (msg.message?.startsWith?.('[file]')) {
      const [, rest] = msg.message.split('[file]');
      const [url, filetype, filename] = rest.split('|', 3);
      return { url, filetype, filename };
    }

    return null;
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !this.currentFriend) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('to', this.currentFriend.id);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.file_id) {
        this.socket.emit('private_message', {
          to: this.currentFriend.id,
          message: '',
          file_id: data.file_id,
          filetype: data.filetype,
          filename: data.filename
        });
      }

      event.target.value = '';
    } catch (error) {
      console.error('File upload error:', error);
    }
  }

  sendMessage(event) {
    event.preventDefault();

    const messageInput = document.getElementById('message-input');
    if (!messageInput || !this.currentFriend) return;

    const message = messageInput.value.trim();
    if (!message) return;

    if (this.currentGroup) {
  this.socket.emit('group_message', {
    group_id: this.currentGroup.id,
    message
  });
} else if (this.currentFriend) {
  this.socket.emit('private_message', {
    to: this.currentFriend.id,
    message
  });
}


    messageInput.value = '';
    messageInput.focus();
  }

  handleIncomingMessage(data) {
    if (!this.currentFriend ||
        (data.from_id !== this.currentFriend.id && data.to_id !== this.currentFriend.id)) {
      return;
    }

    this.displayMessage(data, true);
  }

  async updateFriendStatus(friendId) {
    try {
      const response = await fetch(`/api/last_seen?friend_id=${friendId}`);
      const data = await response.json();

      const chatHeader = document.getElementById('chat-header');
      if (chatHeader && this.currentFriend?.id === friendId) {
        const statusElement = chatHeader.querySelector('.user-status');
        if (statusElement) {
          statusElement.innerHTML = `
            <span class="status-indicator ${data.status === 'online' ? 'status-online' : 'status-offline'}"></span>
            <span>${data.status === 'online' ? 'Online' : data.last_seen}</span>
          `;
        }
      }

      // Update in friend list
      const friendElement = document.querySelector(`#friend-list li[data-friend-id="${friendId}"] .user-status`);
      if (friendElement) {
        friendElement.innerHTML = `
          <span class="status-indicator ${data.status === 'online' ? 'status-online' : 'status-offline'}"></span>
          ${data.status === 'online' ? 'Online' : data.last_seen}
        `;
      }
    } catch (error) {
      console.error('Update friend status error:', error);
    }
  }

  setupFriendStatusUpdates() {
    this.friendStatusInterval = setInterval(() => {
      const friendElements = document.querySelectorAll('#friend-list li[data-friend-id]');
      friendElements.forEach(element => {
        const friendId = element.getAttribute('data-friend-id');
        if (friendId) {
          this.updateFriendStatus(friendId);
        }
      });
    }, 10000);
  }

  receiveGroupInvite({ group_id, group_name, inviter }) {
  if (confirm(`${inviter} invited you to '${group_name}'. Join?`)) {
    this.socket.emit('group_accept', { group_id });
  }
}
groupCreated({ group_id }) {
  // the creator is automatically inside; keep a local record
  this.groups[group_id] = { name: '(you created)', members: [], unreadCount: 0 };
  this.renderGroupList();
}

memberJoined({ user, uid }) {
  // refresh members list if the current group matches
  if (this.currentGroup && this.currentGroup.id === uid)
    this.updateMemberList();
}
renderGroupList() {
  const ul = document.getElementById('group-list');  // new <ul> in sidebar
  if (!ul) return;
  ul.innerHTML = '';
  Object.entries(this.groups).forEach(([gid, g]) => {
    const li = document.createElement('li');
    li.textContent = `${g.name}${g.unreadCount ? ' ('+g.unreadCount+')' : ''}`;
    li.addEventListener('click', () => this.selectGroup(gid));
    if (this.currentGroup?.id === gid) li.classList.add('selected');
    ul.appendChild(li);
  });
}
async selectGroup(gid) {
  this.currentGroup   = { id: gid, ...this.groups[gid] };
  this.currentFriend  = null;             // leave private mode
  this.updateChatUIState();

  document.querySelectorAll('#group-list li').forEach(li=>li.classList.remove('selected'));
  document.querySelector(`#group-list li:nth-child(${Object.keys(this.groups).indexOf(gid)+1})`)
     ?.classList.add('selected');

  const chatHeader = document.getElementById('chat-header');
  chatHeader.textContent = this.groups[gid].name;

  // load previous messages (simple REST endpoint, not shown here)
  const res = await fetch(`/api/chat_history?group_id=${gid}`);
  const data = await res.json();
  const ul = document.getElementById('chat-messages');
  ul.innerHTML = '';
  data.messages.forEach(m => this.displayMessage(m,false));
  ul.scrollTop = ul.scrollHeight;

  // mark all as read
  this.groups[gid].unreadCount = 0;
  this.renderGroupList();
}

handleGroupMessage(d) {
  // if we’re looking at this group show it, otherwise bump unread counter
  if (this.currentGroup?.id === d.group_id) {
    this.displayMessage({
      sender   : d.sender,
      message  : d.message,
      timestamp: d.timestamp
    }, true);
  } else {
    const g = this.groups[d.group_id] || {name:'',members:[],unreadCount:0};
    g.unreadCount += 1;
    this.groups[d.group_id] = g;
    this.renderGroupList();
  }
}

}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ChatApp();
});

