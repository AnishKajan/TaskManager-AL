const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3001", "http://localhost:3000"], // Include both common React ports
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  // Add connection logging
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: ["http://localhost:3001", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

// Enhanced WebSocket connection handling with better logging
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id, 'at', new Date().toLocaleString());
  
  // Join user to their personal room for targeted notifications
  socket.on('join-user-room', (userEmail) => {
    socket.join(userEmail);
    console.log(`👤 User ${userEmail} joined room with socket ${socket.id}`);
  });

  // Handle test notifications
  socket.on('test-notification', (data) => {
    console.log('🧪 Test notification received from', socket.id, ':', data);
    socket.emit('task-reminder', {
      message: 'Test notification successful! WebSocket is working.',
      type: 'test'
    });
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 User disconnected:', socket.id, 'Reason:', reason, 'at', new Date().toLocaleString());
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Debug endpoint to test notifications
app.post('/api/debug/test-notification', (req, res) => {
  const { userEmail, message } = req.body;
  
  if (!userEmail) {
    return res.status(400).json({ error: 'userEmail required' });
  }

  console.log(`🧪 Manual test notification for ${userEmail}: ${message}`);
  
  io.to(userEmail).emit('task-reminder', {
    message: message || 'Manual test notification from server',
    type: 'manual-test'
  });

  res.json({ 
    success: true, 
    message: `Test notification sent to ${userEmail}`,
    timestamp: new Date().toLocaleString()
  });
});

// Debug endpoint to see connected sockets
app.get('/api/debug/sockets', (req, res) => {
  const sockets = [];
  io.sockets.sockets.forEach((socket) => {
    sockets.push({
      id: socket.id,
      rooms: Array.from(socket.rooms),
      connected: socket.connected
    });
  });

  res.json({
    totalSockets: sockets.length,
    sockets: sockets,
    timestamp: new Date().toLocaleString()
  });
});

// Start notification service
const notificationService = require('./services/notificationService');
notificationService.initialize(io);

// Log when server starts
const PORT = process.env.PORT || 5000; // Keep as 5000 for Docker

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT} at ${new Date().toLocaleString()}`);
  console.log('🔔 Notification service initialized');
  console.log('🔌 WebSocket server ready for connections');
});