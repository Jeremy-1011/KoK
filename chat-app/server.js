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
fs.mkdirSync('uploads', { recursive: true });

// ── In-memory store ───────────────────────────────────────────
const channels = { general: [] };   // { channelName: [msg, ...] }
const dms = {};                      // { "userA|userB": [msg, ...] }
const onlineUsers = new Map();       // socketId -> { username, pfp }

function dmKey(a, b) {
  return [a, b].sort().join('|');
}

io.on('connection', (socket) => {
  let currentChannel = 'general';
  let myUsername = null;
  let myPfp = '/default-avatar.svg';

  // ── Register user ───────────────────────────────────────────
  let registered = false;

  socket.on('register', ({ username, pfp }) => {
    myUsername = username;
    myPfp = pfp || '/default-avatar.svg';
    onlineUsers.set(socket.id, { username, pfp: myPfp });
    io.emit('online users', [...onlineUsers.values()]);

    // Send full init only on first connect, not on pfp update re-registers
    if (!registered) {
      registered = true;
      socket.emit('init', {
        channels: Object.keys(channels),
        messages: channels[currentChannel] || [],
        onlineUsers: [...onlineUsers.values()]
      });
    }
  });

  // ── Channel switch ──────────────────────────────────────────
  socket.on('switch channel', (channel) => {
    if (channels[channel] !== undefined) {
      currentChannel = channel;
      socket.emit('load messages', channels[channel]);
    }
  });

  // ── Channel message ─────────────────────────────────────────
  socket.on('chat message', (msg) => {
    msg.id = Date.now() + '-' + Math.random().toString(36).slice(2);
    msg.reactions = {};
    if (!channels[currentChannel]) channels[currentChannel] = [];
    channels[currentChannel].push(msg);
    io.emit('chat message', msg);
  });

  // ── DM ──────────────────────────────────────────────────────
  socket.on('dm', ({ to, msg }) => {
    const key = dmKey(myUsername, to);
    if (!dms[key]) dms[key] = [];
    msg.id = Date.now() + '-' + Math.random().toString(36).slice(2);
    msg.reactions = {};
    dms[key].push(msg);

    // Send to both sender and recipient
    socket.emit('dm message', { from: myUsername, to, msg });
    // Find recipient socket
    for (const [sid, u] of onlineUsers) {
      if (u.username === to) {
        io.to(sid).emit('dm message', { from: myUsername, to, msg });
        break;
      }
    }
  });

  // ── Load DM history ─────────────────────────────────────────
  socket.on('open dm', (otherUser) => {
    const key = dmKey(myUsername, otherUser);
    socket.emit('load dm', { with: otherUser, messages: dms[key] || [] });
  });

  // ── Reactions ───────────────────────────────────────────────
  socket.on('react', ({ msgId, emoji, channel, isDm, dmWith }) => {
    let msg;
    if (isDm) {
      const key = dmKey(myUsername, dmWith);
      msg = (dms[key] || []).find(m => m.id === msgId);
    } else {
      msg = (channels[channel] || []).find(m => m.id === msgId);
    }
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = new Set();
    if (msg.reactions[emoji].has(myUsername)) {
      msg.reactions[emoji].delete(myUsername);
    } else {
      msg.reactions[emoji].add(myUsername);
    }
    // Serialize sets to arrays for JSON
    const serialized = {};
    for (const [e, users] of Object.entries(msg.reactions)) {
      serialized[e] = [...users];
    }
    io.emit('reaction update', { msgId, reactions: serialized });
  });

  // ── Typing ──────────────────────────────────────────────────
  socket.on('typing', ({ username, channel }) => {
    socket.broadcast.emit('typing', { username, channel });
  });
  socket.on('stop typing', ({ username, channel }) => {
    socket.broadcast.emit('stop typing', { username, channel });
  });

  // ── Disconnect ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online users', [...onlineUsers.values()]);
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
const imageFilter = (req, file, cb) => {
  ['image/jpeg','image/png','image/gif','image/webp'].includes(file.mimetype)
    ? cb(null, true) : cb(new Error('Images only'), false);
};
const attachmentFilter = (req, file, cb) => {
  ['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','application/zip']
    .includes(file.mimetype) ? cb(null, true) : cb(new Error('File type not allowed'), false);
};
const uploadImage = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5*1024*1024 } });
const uploadAny   = multer({ storage, fileFilter: attachmentFilter, limits: { fileSize: 20*1024*1024 } });

// ── Static ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// ── Routes ────────────────────────────────────────────────────
app.post('/upload', uploadImage.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ path: `/uploads/${req.file.filename}` });
});
app.post('/upload-any', uploadAny.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ path: `/uploads/${req.file.filename}`, name: req.file.originalname });
});
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
