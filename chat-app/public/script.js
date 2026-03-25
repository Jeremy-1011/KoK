const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messagesContainer = document.getElementById('messages');

const username = prompt('Enter your username') || 'Anonymous';

function addMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('message');

  item.innerHTML = `
    <span class="username">${msg.username}</span>
    <span class="time">${msg.time}</span>
    <div class="text">${msg.text}</div>
  `;

  messagesContainer.appendChild(item);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

socket.on('load messages', (savedMessages) => {
  messagesContainer.innerHTML = '';
  savedMessages.forEach(addMessage);
});

socket.on('chat message', (msg) => {
  addMessage(msg);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (input.value.trim() !== '') {
    const msg = {
      username: username,
      text: input.value.trim(),
      time: new Date().toLocaleTimeString()
    };

    socket.emit('chat message', msg);
    input.value = '';
  }
});