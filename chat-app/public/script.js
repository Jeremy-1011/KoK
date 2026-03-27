const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messagesContainer = document.getElementById('messages');
const channelContainer = document.getElementById('channels');
const chatHeader = document.querySelector('.chat-header');
const pfpInput = document.getElementById('pfpInput');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('file-preview');
const filePreviewName = document.getElementById('file-preview-name');
const clearFileBtn = document.getElementById('clearFile');
const typingIndicator = document.getElementById('typing-indicator');

let username = prompt('Enter your username') || 'Anonymous';
let pfp = '/default-avatar.svg';
let currentChannel = 'general';
let pendingFile = null;

// ── Profile picture ──────────────────────────────────────────
pfpInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.path) pfp = data.path;
});

// ── File attachment selection ────────────────────────────────
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  pendingFile = file;
  filePreviewName.textContent = file.name;
  filePreview.classList.remove('hidden');
});

clearFileBtn.addEventListener('click', () => {
  pendingFile = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
});

// ── Render a message ─────────────────────────────────────────
function addMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('message');

  let fileHTML = '';
  if (msg.file) {
    if (msg.file.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      fileHTML = `<img src="${msg.file}" class="attachment" onclick="window.open('${msg.file}')" />`;
    } else {
      const icon = msg.file.match(/\.pdf$/i) ? '📄' : msg.file.match(/\.zip$/i) ? '🗜' : '📎';
      const name = msg.fileName || msg.file.split('/').pop();
      fileHTML = `<a href="${msg.file}" target="_blank" class="file-link">${icon} ${name}</a>`;
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

// ── Socket: init on connect ───────────────────────────────────
socket.on('init', ({ channels, messages }) => {
  channelContainer.innerHTML = '';
  channels.forEach(ch => addChannelToSidebar(ch, ch === currentChannel));
  messagesContainer.innerHTML = '';
  messages.forEach(addMessage);
});

socket.on('load messages', messages => {
  messagesContainer.innerHTML = '';
  messages.forEach(addMessage);
});

socket.on('chat message', msg => addMessage(msg));

// ── Typing indicator ──────────────────────────────────────────
let typingTimeout;

input.addEventListener('input', () => {
  socket.emit('typing', { username, channel: currentChannel });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop typing', { username, channel: currentChannel });
  }, 1500);
});

const typingUsers = new Set();

socket.on('typing', ({ username: who }) => {
  typingUsers.add(who);
  renderTyping();
});

socket.on('stop typing', ({ username: who }) => {
  typingUsers.delete(who);
  renderTyping();
});

function renderTyping() {
  if (typingUsers.size === 0) {
    typingIndicator.innerHTML = '';
    return;
  }
  const names = [...typingUsers].join(', ');
  const plural = typingUsers.size > 1 ? 'are' : 'is';
  typingIndicator.innerHTML = `
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    &nbsp;<strong>${names}</strong> ${plural} typing…
  `;
}

// ── Send message (with optional file) ────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text && !pendingFile) return;

  // Stop typing
  socket.emit('stop typing', { username, channel: currentChannel });
  clearTimeout(typingTimeout);

  let filePath = null;
  let fileName = null;

  if (pendingFile) {
    const formData = new FormData();
    formData.append('file', pendingFile);
    const res = await fetch('/upload-any', { method: 'POST', body: formData });
    const data = await res.json();
    filePath = data.path;
    fileName = pendingFile.name;
    pendingFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
  }

  socket.emit('chat message', {
    username,
    pfp,
    text,
    file: filePath,
    fileName,
    time: new Date().toLocaleTimeString()
  });

  input.value = '';
});

// ── Channel switching ─────────────────────────────────────────
channelContainer.addEventListener('click', e => {
  if (!e.target.classList.contains('channel')) return;
  const newChannel = e.target.dataset.channel;
  if (newChannel === currentChannel) return;

  currentChannel = newChannel;
  typingUsers.clear();
  renderTyping();
  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  e.target.classList.add('active');
  chatHeader.textContent = `# ${newChannel}`;
  input.placeholder = `Message #${newChannel}`;
  socket.emit('switch channel', newChannel);
});

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
    if (currentChannel === ch) {
      currentChannel = 'general';
      chatHeader.textContent = '# general';
      input.placeholder = 'Message #general';
      socket.emit('switch channel', 'general');
      document.querySelector('.channel[data-channel="general"]')?.classList.add('active');
    }
  }
});
