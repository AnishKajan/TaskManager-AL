const express = require('express');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const connectDB = require('../db/mongoClient');

const router = express.Router();

// Enhanced middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid token' });
  }
}

// Test immediate notification for a specific task
router.post('/test/:taskId', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;
    const db = await connectDB();
    
    const task = await db.collection('tasks').findOne({ 
      _id: new ObjectId(taskId) 
    });
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if user has permission (owner or collaborator)
    const isOwner = task.userId.toString() === req.userId.toString();
    const isCollaborator = task.collaborators && task.collaborators.includes(req.userEmail);
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Not authorized to test notifications for this task' });
    }

    // Send test notification - get notification service
    const notificationService = require('../services/notificationService');
    const sent = await notificationService.checkImmediateNotification(task, req.userEmail);
    
    res.json({ 
      message: sent ? 'Test notification sent' : 'No notification needed for this task',
      sent 
    });
  } catch (err) {
    console.error('❌ Test notification error:', err);
    res.status(500).json({ message: 'Failed to send test notification' });
  }
});

// Get notification history for user
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const db = await connectDB();
    
    // Find tasks where user is creator or collaborator
    const userTasks = await db.collection('tasks')
      .find({
        $or: [
          { userId: req.userId },
          { collaborators: req.userEmail }
        ]
      }, { projection: { _id: 1 } })
      .toArray();
    
    const taskIds = userTasks.map(task => task._id);
    
    // Get notifications for these tasks
    const notifications = await db.collection('notifications')
      .find({ 
        taskId: { $in: taskIds }
      })
      .sort({ sentAt: -1 })
      .limit(50)
      .toArray();
    
    res.json(notifications);
  } catch (err) {
    console.error('❌ Get notification history error:', err);
    res.status(500).json({ message: 'Failed to fetch notification history' });
  }
});

module.exports = router;