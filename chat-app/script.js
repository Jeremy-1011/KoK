const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

const username = prompt("Enter your username") || "Anonymous";

function addMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('message');

  item.innerHTML = `
    <span class="username">${msg.username}</span>
    <span class="time">${msg.time}</span>
    <div class="text">${msg.text}</div>
  `;

  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

socket.on('load messages', function(savedMessages) {
  messages.innerHTML = '';
  savedMessages.forEach(addMessage);
});

form.addEventListener('submit', function(e) {
  e.preventDefault();

  if (input.value.trim()) {
    const msg = {
      username,
      text: input.value,
      time: new Date().toLocaleTimeString()
    };

    socket.emit('chat message', msg);
    input.value = '';
  }
});

socket.on('chat message', addMessage);