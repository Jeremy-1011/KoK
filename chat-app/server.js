const express = require('express');
const http = require('http');
const socketio = require('socket.io');

// Set up the app
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serve the frontend files from a "public" folder
app.use(express.static('public'));

// This runs when a user connects
io.on('connection', (socket) => {
  console.log('A user connected');

  // Listen for a chat message from this user
  socket.on('chat message', (msg) => {
    console.log('Message received: ' + msg);
    // Send it to EVERYONE connected
    io.emit('chat message', msg);
  });

  // This runs when a user disconnects
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start the server on port 3000
server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});