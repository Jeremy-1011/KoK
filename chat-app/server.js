const express  = require('express');
const multer   = require('multer');
const socketio = require('socket.io');
const path     = require('path');
const http     = require('http');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');

const app    = express();
const PORT   = process.env.PORT || 3000;
const server = http.createServer(app);
const io     = socketio(server);

app.use(express.json());
fs.mkdirSync('uploads', { recursive: true });

// ── Config ────────────────────────────────────────────────────
// Set these as Railway environment variables:
//   ADMIN_PASSWORD  → your secret admin page password
//   SESSION_SECRET  → any long random string
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const ACCOUNTS_FILE  = path.join(__dirname, 'data', 'accounts.json');

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

// ── Accounts helpers ──────────────────────────────────────────
function loadAccounts() {
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

// ── Simple session store (in-memory token → username) ─────────
const sessions = new Map(); // token → username
function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Auth middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Not logged in' });
  req.username = sessions.get(token);
  next();
}

// ── Chat store ────────────────────────────────────────────────
const channels   = { general: [] };
const dms        = {};
const onlineUsers = new Map(); // socketId → { username, pfp }

function dmKey(a, b) { return [a, b].sort().join('|'); }

// ── Socket.io ─────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentChannel = 'general';
  let myUsername     = null;
  let registered     = false;

  socket.on('register', ({ username, pfp }) => {
    myUsername = username;
    onlineUsers.set(socket.id, { username, pfp: pfp || '/default-avatar.svg' });
    io.emit('online users', [...onlineUsers.values()]);
    if (!registered) {
      registered = true;
      socket.emit('init', {
        channels:    Object.keys(channels),
        messages:    channels[currentChannel] || [],
        onlineUsers: [...onlineUsers.values()]
      });
    }
  });

  socket.on('switch channel', (channel) => {
    if (channels[channel] !== undefined) {
      currentChannel = channel;
      socket.emit('load messages', channels[channel]);
    }
  });

  socket.on('chat message', (msg) => {
    msg.id        = Date.now() + '-' + Math.random().toString(36).slice(2);
    msg.reactions = {};
    if (!channels[currentChannel]) channels[currentChannel] = [];
    channels[currentChannel].push(msg);
    io.emit('chat message', msg);
  });

  socket.on('dm', ({ to, msg }) => {
    const key = dmKey(myUsername, to);
    if (!dms[key]) dms[key] = [];
    msg.id        = Date.now() + '-' + Math.random().toString(36).slice(2);
    msg.reactions = {};
    dms[key].push(msg);
    socket.emit('dm message', { from: myUsername, to, msg });
    for (const [sid, u] of onlineUsers) {
      if (u.username === to) { io.to(sid).emit('dm message', { from: myUsername, to, msg }); break; }
    }
  });

  socket.on('open dm', (otherUser) => {
    const key = dmKey(myUsername, otherUser);
    socket.emit('load dm', { with: otherUser, messages: dms[key] || [] });
  });

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
    msg.reactions[emoji].has(myUsername)
      ? msg.reactions[emoji].delete(myUsername)
      : msg.reactions[emoji].add(myUsername);
    const serialized = {};
    for (const [e, users] of Object.entries(msg.reactions)) serialized[e] = [...users];
    io.emit('reaction update', { msgId, reactions: serialized });
  });

  socket.on('typing',      ({ username, channel }) => socket.broadcast.emit('typing',      { username, channel }));
  socket.on('stop typing', ({ username, channel }) => socket.broadcast.emit('stop typing', { username, channel }));

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online users', [...onlineUsers.values()]);
  });
});

// ── Auth routes ───────────────────────────────────────────────

// Register a new account
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 2 || username.length > 24)
    return res.status(400).json({ error: 'Username must be 2–24 characters' });
  if (!/^[a-zA-Z0-9_\- ]+$/.test(username))
    return res.status(400).json({ error: 'Username: letters, numbers, spaces, _ and - only' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const accounts = loadAccounts();
  const key = username.toLowerCase();
  if (accounts[key]) return res.status(409).json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, 10);
  accounts[key] = { username, hash, createdAt: new Date().toISOString(), pfp: '/default-avatar.svg' };
  saveAccounts(accounts);

  const token = makeToken();
  sessions.set(token, username);
  res.json({ token, username, pfp: accounts[key].pfp });
});

// Login
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const accounts = loadAccounts();
  const account  = accounts[username.toLowerCase()];
  if (!account) return res.status(401).json({ error: 'Invalid username or password' });

  const match = await bcrypt.compare(password, account.hash);
  if (!match) return res.status(401).json({ error: 'Invalid username or password' });

  const token = makeToken();
  sessions.set(token, account.username);
  res.json({ token, username: account.username, pfp: account.pfp });
});

// Update pfp (requires auth)
app.post('/auth/pfp', requireAuth, (req, res) => {
  const { pfp } = req.body;
  const accounts = loadAccounts();
  const key = req.username.toLowerCase();
  if (accounts[key]) { accounts[key].pfp = pfp; saveAccounts(accounts); }
  res.json({ ok: true });
});

// ── Admin page ────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Admin — KoK Chat</title>
  <style>
    body { font-family: Arial, sans-serif; background: #1e1f22; color: #dcddde; max-width: 600px; margin: 60px auto; padding: 0 20px; }
    h1 { color: #fff; }
    input { width: 100%; padding: 10px; margin: 8px 0; border-radius: 6px; border: 1px solid #40444b; background: #2f3136; color: #fff; font-size: 14px; box-sizing: border-box; }
    button { width: 100%; padding: 10px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; margin-top: 4px; }
    .btn-red { background: #ed4245; color: white; }
    .btn-red:hover { background: #c03537; }
    .btn-blue { background: #5865f2; color: white; }
    .btn-blue:hover { background: #4752c4; }
    .msg { margin-top: 12px; padding: 10px; border-radius: 6px; }
    .error { background: #3d1c1c; color: #f28b82; }
    .success { background: #1c3d24; color: #81c784; }
    .accounts { margin-top: 20px; }
    .account-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2f3136; border-radius: 6px; margin-bottom: 6px; }
    .del-btn { background: #ed4245; color: white; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
    #login-section, #admin-section { display: block; }
  </style>
</head>
<body>
  <h1>🔧 KoK Admin</h1>

  <div id="login-section">
    <p>Enter your admin password to continue.</p>
    <input type="password" id="adminPass" placeholder="Admin password" />
    <button class="btn-blue" onclick="login()">Login</button>
    <div id="login-msg"></div>
  </div>

  <div id="admin-section" style="display:none">
    <h2>Accounts</h2>
    <button class="btn-red" onclick="resetAll()">⚠️ Reset ALL accounts</button>
    <div class="accounts" id="account-list"></div>
  </div>

  <script>
    let adminKey = '';

    async function login() {
      adminKey = document.getElementById('adminPass').value;
      const res = await fetch('/admin/accounts', { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) {
        document.getElementById('login-msg').innerHTML = '<div class="msg error">Wrong password</div>';
        return;
      }
      const data = await res.json();
      document.getElementById('login-section').style.display = 'none';
      document.getElementById('admin-section').style.display = 'block';
      renderAccounts(data);
    }

    function renderAccounts(accounts) {
      const el = document.getElementById('account-list');
      if (!accounts.length) { el.innerHTML = '<p>No accounts yet.</p>'; return; }
      el.innerHTML = accounts.map(a => \`
        <div class="account-row">
          <span><strong>\${a.username}</strong> <small style="color:#72767d">— joined \${new Date(a.createdAt).toLocaleDateString()}</small></span>
          <button class="del-btn" onclick="deleteAccount('\${a.username}')">Delete</button>
        </div>
      \`).join('');
    }

    async function deleteAccount(username) {
      if (!confirm('Delete ' + username + '?')) return;
      const res = await fetch('/admin/delete', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (data.ok) loadAccounts();
    }

    async function resetAll() {
      if (!confirm('Delete ALL accounts? This cannot be undone.')) return;
      const res = await fetch('/admin/reset', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey }
      });
      const data = await res.json();
      if (data.ok) { alert('All accounts deleted.'); loadAccounts(); }
    }

    async function loadAccounts() {
      const res = await fetch('/admin/accounts', { headers: { 'x-admin-key': adminKey } });
      const data = await res.json();
      renderAccounts(data);
    }

    document.getElementById('adminPass').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  </script>
</body>
</html>`);
});

// Admin API middleware
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/admin/accounts', requireAdmin, (req, res) => {
  const accounts = loadAccounts();
  res.json(Object.values(accounts).map(({ username, createdAt }) => ({ username, createdAt })));
});

app.post('/admin/delete', requireAdmin, (req, res) => {
  const { username } = req.body;
  const accounts = loadAccounts();
  delete accounts[username.toLowerCase()];
  saveAccounts(accounts);
  res.json({ ok: true });
});

app.post('/admin/reset', requireAdmin, (req, res) => {
  saveAccounts({});
  sessions.clear();
  res.json({ ok: true });
});

// ── Upload routes ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => {
    const u = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, u + path.extname(file.originalname));
  }
});
const imageFilter      = (req, file, cb) => ['image/jpeg','image/png','image/gif','image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new Error('Images only'), false);
const attachmentFilter = (req, file, cb) => ['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','application/zip'].includes(file.mimetype) ? cb(null, true) : cb(new Error('File type not allowed'), false);
const uploadImage = multer({ storage, fileFilter: imageFilter,      limits: { fileSize: 5*1024*1024  } });
const uploadAny   = multer({ storage, fileFilter: attachmentFilter, limits: { fileSize: 20*1024*1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.post('/upload',     uploadImage.single('file'), (req, res) => {
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
