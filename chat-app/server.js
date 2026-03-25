const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(express.static('public'));

// Now stores objects instead of strings
const messages = [];

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send message history to new user
  messages.forEach((msg) => {
    socket.emit('chat message', msg);
  });

socket.on('user joined', (username) => {
  io.emit('chat message', {
    username: 'system',
    text: username + ' has joined the chat',
    time: new Date().toLocaleTimeString()
  })
})

  socket.on('chat message', (msg) => {
    messages.push(msg);
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});