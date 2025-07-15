let username = '';
let room = '';

// UI Elements
const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');

// Overlay for username and room selection
const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.innerHTML = `
  <div class="modal">
    <h2>Welcome to Realtime Chat</h2>
    <input id="username-input" placeholder="Enter your username" maxlength="16" />
    <div id="room-options">
      <button id="create-room">Create Room</button>
      <button id="join-room">Join Room</button>
    </div>
    <div id="room-create" style="display:none;">
      <p>Room created! Share this code:</p>
      <div id="room-code-display"></div>
      <button id="enter-room-btn">Enter Room</button>
    </div>
    <div id="room-join" style="display:none;">
      <input id="room-code-input" placeholder="Enter room code" maxlength="8" />
      <button id="join-room-btn">Join</button>
    </div>
    <div id="error-msg" style="color:red;"></div>
  </div>
`;
document.body.appendChild(overlay);

const socket = io();

function showError(msg) {
  document.getElementById('error-msg').textContent = msg;
}

// Username and room logic
let selectedAction = '';
document.getElementById('create-room').onclick = () => {
  selectedAction = 'create';
  const uname = document.getElementById('username-input').value.trim();
  if (!uname) return showError('Enter a username!');
  username = uname;
  socket.emit('create_room', { username });
};
document.getElementById('join-room').onclick = () => {
  selectedAction = 'join';
  document.getElementById('room-options').style.display = 'none';
  document.getElementById('room-join').style.display = 'block';
};
document.getElementById('join-room-btn').onclick = () => {
  const uname = document.getElementById('username-input').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!uname) return showError('Enter a username!');
  if (!code) return showError('Enter a room code!');
  username = uname;
  socket.emit('join_room', { username, room: code });
};
document.getElementById('enter-room-btn').onclick = () => {
  overlay.style.display = 'none';
};

socket.on('room_created', data => {
  room = data.room;
  document.getElementById('room-options').style.display = 'none';
  document.getElementById('room-create').style.display = 'block';
  document.getElementById('room-code-display').textContent = room;
});
socket.on('room_joined', data => {
  room = data.room;
  overlay.style.display = 'none';
});
socket.on('user_joined', data => {
  const li = document.createElement('li');
  li.textContent = `${data.username} joined the room.`;
  li.className = 'system-msg';
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
});
socket.on('error', data => {
  showError(data.message);
});

form.addEventListener('submit', function(e) {
  e.preventDefault();
  if (input.value.trim() && room && username) {
    socket.emit('send_message', {
      room,
      username,
      message: input.value
    });
    input.value = '';
  }
});

socket.on('receive_message', function(data) {
  const li = document.createElement('li');
  if (data.username === username) {
    li.innerHTML = `<span class="you">You:</span> ${data.message}`;
    li.className = 'my-msg';
  } else {
    li.innerHTML = `<span class="other">${data.username}:</span> ${data.message}`;
    li.className = 'other-msg';
  }
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}); 