const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'channel_data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Create necessary directories
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Multer setup for attachments & PFPs
const upload = multer({ dest: UPLOADS_DIR });

// Load or create default channels
let channels = {};
const defaultChannels = ['general'];
defaultChannels.forEach(ch => {
  const filePath = path.join(DATA_DIR, `${ch}.json`);
  if (fs.existsSync(filePath)) channels[ch] = JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
  else {
    channels[ch] = [];
    fs.writeFileSync(filePath, '[]');
  }
});

// Save messages per channel
function saveChannel(channel) {
  fs.writeFileSync(path.join(DATA_DIR, `${channel}.json`), JSON.stringify(channels[channel], null, 2));
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Upload attachment or PFP
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  res.json({ path: `/uploads/${req.file.filename}` });
});

// Add or delete channels
app.post('/channel', express.json(), (req, res) => {
  const { action, channel } = req.body;
  if (action === 'add') {
    if (!channels[channel]) {
      channels[channel] = [];
      saveChannel(channel);
      io.emit('channel added', channel);
      return res.json({ success: true });
    }
    return res.json({ success: false, error: 'Channel exists' });
  } else if (action === 'delete') {
    if (channels[channel]) {
      delete channels[channel];
      fs.unlinkSync(path.join(DATA_DIR, `${channel}.json`));
      io.emit('channel deleted', channel);
      return res.json({ success: true });
    }
    return res.json({ success: false, error: 'Channel not found' });
  }
  res.status(400).json({ success: false });
});

// Socket.IO connections
io.on('connection', socket => {
  console.log('User connected:', socket.id);

  let currentChannel = 'general';
  socket.join(currentChannel);
  socket.emit('load messages', channels[currentChannel]);

  socket.on('switch channel', newChannel => {
    if (!channels[newChannel]) channels[newChannel] = [];
    socket.leave(currentChannel);
    currentChannel = newChannel;
    socket.join(currentChannel);
    socket.emit('load messages', channels[currentChannel]);
  });

  socket.on('chat message', msg => {
    if (!channels[currentChannel]) channels[currentChannel] = [];
    channels[currentChannel].push(msg);

    if (channels[currentChannel].length > 100)
      channels[currentChannel] = channels[currentChannel].slice(-100);

    saveChannel(currentChannel);
    io.to(currentChannel).emit('chat message', msg);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));