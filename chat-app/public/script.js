const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messagesContainer = document.getElementById('messages');
const channelContainer = document.getElementById('channels');
const chatHeader = document.querySelector('.chat-header');
const pfpInput = document.getElementById('pfpInput');

let username = prompt('Enter your username') || 'Anonymous';
let pfp = '/default-avatar.svg';
let currentChannel = 'general';

// Upload profile picture
pfpInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.path) pfp = data.path;
});

// Add message to chat
function addMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('message');

  let fileHTML = '';
  if (msg.file) {
    if (msg.file.match(/\.(jpg|jpeg|png|gif)$/i)) {
      fileHTML = `<img src="${msg.file}" class="attachment" />`;
    } else {
      fileHTML = `<a href="${msg.file}" target="_blank">Download file</a>`;
    }
  }

  item.innerHTML = `
    <img class="pfp" src="${msg.pfp || '/default-avatar.svg'}" onerror="this.src='/default-avatar.svg'" />
    <div class="message-content">
      <span class="username">${msg.username}</span>
      <span class="time">${msg.time}</span>
      <div class="text">${msg.text}</div>
      ${fileHTML}
    </div>
  `;

  messagesContainer.appendChild(item);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// On connect: receive channel list + message history
socket.on('init', ({ channels, messages }) => {
  // Rebuild sidebar channels
  channelContainer.innerHTML = '';
  channels.forEach(ch => addChannelToSidebar(ch, ch === currentChannel));

  // Load messages
  messagesContainer.innerHTML = '';
  messages.forEach(addMessage);
});

// Load messages when switching channels
socket.on('load messages', messages => {
  messagesContainer.innerHTML = '';
  messages.forEach(addMessage);
});

// New incoming message
socket.on('chat message', msg => addMessage(msg));

// Send message
form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat message', {
    username,
    pfp,
    text,
    time: new Date().toLocaleTimeString()
  });
  input.value = '';
});

// Switch channel
channelContainer.addEventListener('click', e => {
  if (!e.target.classList.contains('channel')) return;
  const newChannel = e.target.dataset.channel;
  if (newChannel === currentChannel) return;

  currentChannel = newChannel;
  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  e.target.classList.add('active');
  chatHeader.textContent = `# ${newChannel}`;
  input.placeholder = `Message #${newChannel}`;
  socket.emit('switch channel', newChannel);
});

// Add channel
document.getElementById('addChannel').addEventListener('click', async () => {
  const name = prompt('Channel name:');
  if (!name) return;
  const res = await fetch('/channel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', channel: name })
  });
  const data = await res.json();
  if (data.error) alert(data.error);
});

// Delete channel
document.getElementById('deleteChannel').addEventListener('click', async () => {
  const name = prompt('Delete channel name:');
  if (!name) return;
  const res = await fetch('/channel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', channel: name })
  });
  const data = await res.json();
  if (data.error) alert(data.error);
});

// Helpers for sidebar
function addChannelToSidebar(ch, active = false) {
  const div = document.createElement('div');
  div.classList.add('channel');
  if (active) div.classList.add('active');
  div.dataset.channel = ch;
  div.textContent = `# ${ch}`;
  channelContainer.appendChild(div);
}

socket.on('channel added', ch => addChannelToSidebar(ch));

socket.on('channel deleted', ch => {
  const div = document.querySelector(`.channel[data-channel="${ch}"]`);
  if (div) {
    div.remove();
    // If we were in the deleted channel, switch to general
    if (currentChannel === ch) {
      currentChannel = 'general';
      chatHeader.textContent = '# general';
      input.placeholder = 'Message #general';
      socket.emit('switch channel', 'general');
      document.querySelector('.channel[data-channel="general"]')?.classList.add('active');
    }
  }
});
