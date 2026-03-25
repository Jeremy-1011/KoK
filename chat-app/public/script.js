const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messagesContainer = document.getElementById('messages');
const channelContainer = document.getElementById('channels');
const pfpInput = document.getElementById('pfpInput');

let username = prompt('Enter your username') || 'Anonymous';
let pfp = '/default-avatar.png'; // default PFP

// Set PFP
pfpInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();
  pfp = data.path;
});

// Add message to chat
function addMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('message');

  let fileHTML = '';
  if (msg.file) {
    if (msg.file.match(/\.(jpg|jpeg|png|gif)$/i)) fileHTML = `<img src="${msg.file}" class="attachment" />`;
    else fileHTML = `<a href="${msg.file}" target="_blank">Download file</a>`;
  }

  item.innerHTML = `
    <img class="pfp" src="${msg.pfp || '/default-avatar.png'}" />
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

// Load messages
socket.on('load messages', saved => {
  messagesContainer.innerHTML = '';
  saved.forEach(addMessage);
});

// New chat message
socket.on('chat message', msg => addMessage(msg));

// Send message
form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const msg = { username, pfp, text, time: new Date().toLocaleTimeString() };
  socket.emit('chat message', msg);
  input.value = '';
});

// Channel switch
channelContainer.addEventListener('click', e => {
  if (!e.target.classList.contains('channel')) return;
  const newChannel = e.target.dataset.channel;
  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  e.target.classList.add('active');
  socket.emit('switch channel', newChannel);
});

// Add channel
document.getElementById('addChannel').addEventListener('click', async () => {
  const name = prompt('Channel name:');
  if (!name) return;
  await fetch('/channel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', channel: name }) });
});

// Delete channel
document.getElementById('deleteChannel').addEventListener('click', async () => {
  const name = prompt('Delete channel name:');
  if (!name) return;
  await fetch('/channel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', channel: name }) });
});

// Update sidebar dynamically
socket.on('channel added', ch => {
  const div = document.createElement('div');
  div.classList.add('channel');
  div.dataset.channel = ch;
  div.textContent = `# ${ch}`;
  channelContainer.appendChild(div);
});

socket.on('channel deleted', ch => {
  const div = document.querySelector(`.channel[data-channel="${ch}"]`);
  if (div) div.remove();
});