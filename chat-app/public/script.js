const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messagesContainer = document.getElementById('messages');
const fileInput = document.getElementById('fileInput');

const username = prompt('Enter your username') || 'Anonymous';

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
    <span class="username">${msg.username}</span>
    <span class="time">${msg.time}</span>
    <div class="text">${msg.text}</div>
    ${fileHTML}
  `;

  messagesContainer.appendChild(item);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Load channel messages
socket.on('load messages', savedMessages => {
  messagesContainer.innerHTML = '';
  savedMessages.forEach(addMessage);
});

// Receive new chat message
socket.on('chat message', msg => addMessage(msg));

// Send text message
form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    username,
    text,
    time: new Date().toLocaleTimeString()
  };

  socket.emit('chat message', msg);
  input.value = '';
});

// Switch channels
document.querySelectorAll('.channel').forEach(el => {
  el.addEventListener('click', () => {
    const newChannel = el.dataset.channel;
    document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    socket.emit('switch channel', newChannel);
  });
});