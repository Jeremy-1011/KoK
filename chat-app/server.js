const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

form.addEventListener('submit', function(e) {
  e.preventDefault();

  if (input.value) {
    const msg = {
      username: username, // make sure you set this earlier
      text: input.value,
      time: new Date().toLocaleTimeString()
    };

    socket.emit('chat message', msg);
    input.value = '';
  }
});

socket.on('chat message', function(msg) {
  const item = document.createElement('div');
  item.classList.add('message');

  item.innerHTML = `
    <span class="username">${msg.username}</span>
    <span class="time">${msg.time}</span>
    <div class="text">${msg.text}</div>
  `;

  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
});