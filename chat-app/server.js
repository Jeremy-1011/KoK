const express = require('express');
const multer = require('multer');
const socketio = require('socket.io');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = socketio(server);

const messages = [];

io.on('connection', (socket) => {
  console.log('A user connected');

  // 1. send message history to new user
  messages.forEach((msg) => {
    socket.emit('chat message', msg);
  });

  // 2. listen for a user joining
  socket.on('user joined', (username) => {
    io.emit('chat message', {
      username: '⚡ System',
      text: username + ' has joined the chat',
      time: new Date().toLocaleTimeString()
    });
  });

  // 3. listen for a chat message
  socket.on('chat message', (msg) => {
    messages.push(msg);
    io.emit('chat message', msg);
  });

  // 4. listen for disconnect (fixed: was 'disconnected')
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

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

// Create Multer instance
const upload = multer({ storage, fileFilter });

// Serve frontend from /public folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  res.send(`File uploaded successfully: ${req.file.filename}`);
});

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));