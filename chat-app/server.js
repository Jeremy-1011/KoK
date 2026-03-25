const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'channel_data');

// Ensure channel data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Load messages per channel
const channels = {};
const defaultChannels = ['general', 'gaming', 'tech'];

defaultChannels.forEach(ch => {
  const filePath = path.join(DATA_DIR, `${ch}.json`);
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf8');
    channels[ch] = JSON.parse(data || '[]');
  } else {
    channels[ch] = [];
    fs.writeFileSync(filePath, '[]');
  }
});

// Save messages for a channel
function saveChannelMessages(channel) {
  const filePath = path.join(DATA_DIR, `${channel}.json`);
  fs.writeFileSync(filePath, JSON.stringify(channels[channel], null, 2));
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  let currentChannel = 'general';
  socket.join(currentChannel);
  socket.emit('load messages', channels[currentChannel]);

  // Switch channel
  socket.on('switch channel', newChannel => {
    if (!channels[newChannel]) {
      channels[newChannel] = [];
      saveChannelMessages(newChannel);
    }
    socket.leave(currentChannel);
    currentChannel = newChannel;
    socket.join(currentChannel);
    socket.emit('load messages', channels[currentChannel]);
  });

  // Receive chat message
  socket.on('chat message', msg => {
    if (!channels[currentChannel]) channels[currentChannel] = [];
    channels[currentChannel].push(msg);

    if (channels[currentChannel].length > 100) {
      channels[currentChannel] = channels[currentChannel].slice(-100);
    }

    saveChannelMessages(currentChannel);
    io.to(currentChannel).emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));