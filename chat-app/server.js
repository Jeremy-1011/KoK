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

// Serve public folder
app.use(express.static(path.join(__dirname, 'public')));

// Load saved messages
let messages = [];

if (fs.existsSync(MESSAGES_FILE)) {
  try {
    const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
    messages = JSON.parse(data);
  } catch (error) {
    console.error('Error reading messages.json:', error);
    messages = [];
  }
}

// Save messages function
function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.error('Error saving messages:', error);
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send old messages to the person who just joined
  socket.emit('load messages', messages);

  socket.on('chat message', (msg) => {
    messages.push(msg);

    // Optional: keep only last 100 messages
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