const express = require('express');
const multer = require('multer');
const socketio = require('socket.io');
const path = require('path');
const http = require('http');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = socketio(server);

app.use(express.json());

// Ensure uploads folder exists
fs.mkdirSync('uploads', { recursive: true });

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

  // Typing indicators — broadcast to everyone else in the same channel
  socket.on('typing', ({ username, channel }) => {
    socket.broadcast.emit('typing', { username, channel });
  });

  socket.on('stop typing', ({ username, channel }) => {
    socket.broadcast.emit('stop typing', { username, channel });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// ── Storage ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

// Images only (for profile pictures)
const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Images only'), false);
};

// Any allowed file type (for chat attachments)
const attachmentFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
                   'application/pdf', 'text/plain', 'application/zip'];
  allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('File type not allowed'), false);
};

const uploadImage = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadAny   = multer({ storage, fileFilter: attachmentFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Static ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// ── Routes ────────────────────────────────────────────────────

// Profile picture upload
app.post('/upload', uploadImage.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

// Chat file/image attachment upload
app.post('/upload-any', uploadAny.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ path: `/uploads/${req.file.filename}`, name: req.file.originalname });
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

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
