const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

app.use(express.static(path.join(__dirname, 'public')));

let messages = [];

try {
  if (fs.existsSync(MESSAGES_FILE)) {
    const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
    messages = JSON.parse(data || '[]');
  } else {
    fs.writeFileSync(MESSAGES_FILE, '[]');
  }
} catch (err) {
  console.error('Error loading messages:', err);
  messages = [];
}

function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    console.log('Messages saved');
  } catch (err) {
    console.error('Error saving messages:', err);
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.emit('load messages', messages);

  socket.on('chat message', (msg) => {
    messages.push(msg);

    if (messages.length > 100) {
      messages = messages.slice(-100);
    }

    saveMessages();
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});