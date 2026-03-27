const express = require('express');
const multer = require('multer');
const socketio = require('socket.io');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = socketio(server);

app.use(express.json());

// In-memory store
const channels = { general: [] };

io.on('connection', (socket) => {
  console.log('A user connected');

  let currentChannel = 'general';

  // Send channel list and message history on connect
  socket.emit('init', {
    channels: Object.keys(channels),
    messages: channels[currentChannel] || []
  });

  // Switch channel
  socket.on('switch channel', (channel) => {
    if (channels[channel] !== undefined) {
      currentChannel = channel;
      socket.emit('load messages', channels[channel]);
    }
  });

  // Chat message
  socket.on('chat message', (msg) => {
    if (!channels[currentChannel]) channels[currentChannel] = [];
    channels[currentChannel].push(msg);
    io.emit('chat message', msg);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({ storage, fileFilter });

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Upload profile picture — returns JSON so script.js can parse it
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

// Add / delete channels
app.post('/channel', (req, res) => {
  const { action, channel } = req.body;
  const name = channel?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!name) return res.status(400).json({ error: 'Invalid channel name' });

  if (action === 'add') {
    if (channels[name]) return res.status(400).json({ error: 'Channel already exists' });
    channels[name] = [];
    io.emit('channel added', name);
    return res.json({ ok: true });
  }

  if (action === 'delete') {
    if (name === 'general') return res.status(400).json({ error: 'Cannot delete #general' });
    delete channels[name];
    io.emit('channel deleted', name);
    return res.json({ ok: true });
  }

  res.status(400).json({ error: 'Unknown action' });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
