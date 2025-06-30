const express = require('express');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const connectDB = require('../db/mongoClient');

const router = express.Router();

// Enhanced middleware with better debugging
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log('🔍 Auth header:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No valid authorization header');
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('❌ No token found');
    return res.status(401).json({ message: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token decoded:', { id: decoded.id, email: decoded.email });
    
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    res.status(403).json({ message: 'Invalid token' });
  }
}

// UPDATED: Get all non-archived tasks for the logged-in user (including collaborative tasks)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = await connectDB();
    console.log('🔍 Fetching tasks for user:', req.userId, 'email:', req.userEmail);
    
    // COLLABORATIVE FEATURE: Find tasks where user is either creator OR collaborator
    const tasks = await db.collection('tasks')
      .find({ 
        $or: [
          { userId: req.userId }, // Tasks user created
          { collaborators: req.userEmail } // Tasks user collaborates on
        ],
        status: { $nin: ['Deleted'] }
      })
      .sort({ 
        'date': 1, 
        'startTime.period': 1, 
        'startTime.hour': 1, 
        'startTime.minute': 1 
      })
      .toArray();

    console.log(`✅ Found ${tasks.length} tasks (including collaborative)`);
    res.json(tasks);
  } catch (err) {
    console.error('❌ Get tasks error:', err);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// UPDATED: Get archived tasks (including collaborative ones)
router.get('/archive', authMiddleware, async (req, res) => {
  try {
    const db = await connectDB();
    
    // Auto-cleanup: Delete tasks that have been in deleted status for more than 5 days
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const cleanupResult = await db.collection('tasks').deleteMany({
      $or: [
        { userId: req.userId },
        { collaborators: req.userEmail }
      ],
      status: 'Deleted',
      deletedAt: { $lt: fiveDaysAgo }
    });
    
    console.log(`🧹 Cleaned up ${cleanupResult.deletedCount} old deleted tasks`);

    // Get remaining archived tasks (including collaborative)
    const tasks = await db.collection('tasks')
      .find({
        $or: [
          { userId: req.userId },
          { collaborators: req.userEmail }
        ],
        $and: [
          {
            $or: [
              { status: 'Complete' },
              { status: 'Deleted', deletedAt: { $gte: fiveDaysAgo } }
            ]
          }
        ]
      })
      .sort({ deletedAt: -1, createdAt: -1 })
      .toArray();

    console.log(`✅ Found ${tasks.length} archived tasks (including collaborative)`);
    res.json(tasks);
  } catch (err) {
    console.error('❌ Get archive error:', err);
    res.status(500).json({ message: 'Failed to fetch archived tasks' });
  }
});

// UPDATED: Create a new task with immediate notification check
router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = await connectDB();
    const {
      title,
      date,
      startTime,
      endTime,
      collaborators,
      priority,
      recurring,
      section,
      status
    } = req.body;

    console.log('📝 Creating task:', { title, section, userId: req.userId, collaborators });

    // PRIVACY VALIDATION: Check if all collaborators have public privacy
    if (collaborators && collaborators.length > 0) {
      const collaboratorUsers = await db.collection('users')
        .find({ 
          email: { $in: collaborators },
          privacy: { $ne: 'public' }
        })
        .toArray();
      
      if (collaboratorUsers.length > 0) {
        const privateUsers = collaboratorUsers.map(u => u.email);
        return res.status(403).json({ 
          message: 'Some users have private profiles and cannot be added as collaborators',
          privateUsers 
        });
      }
    }

    const task = {
      title,
      date,
      startTime: {
        hour: startTime.hour,
        minute: startTime.minute,
        period: startTime.period
      },
      endTime: endTime ? {
        hour: endTime.hour,
        minute: endTime.minute,
        period: endTime.period
      } : null,
      collaborators: collaborators || [],
      priority: priority || null,
      recurring: recurring || null,
      section: section || 'work',
      userId: req.userId,
      createdBy: req.userEmail,
      status: status || 'Pending',
      createdAt: new Date(),
      deletedAt: null
    };

    const result = await db.collection('tasks').insertOne(task);
    const createdTask = await db.collection('tasks').findOne({ _id: result.insertedId });

    console.log('✅ Task created with ID:', result.insertedId);
    
    // NOTIFICATION: Check if task starts soon and send immediate notification
    try {
      const notificationService = require('../services/notificationService');
      await notificationService.checkImmediateNotification(createdTask, req.userEmail);
    } catch (notifError) {
      console.error('⚠️ Notification error (non-blocking):', notifError);
      // Don't fail the task creation if notification fails
    }
    
    res.status(201).json(createdTask);
  } catch (err) {
    console.error('❌ Create task error:', err);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// UPDATED: Enhanced PUT route with collaborative authorization and notification check
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    console.log('🔍 PUT request details:');
    console.log('  - Task ID:', taskId);
    console.log('  - User ID:', req.userId);
    console.log('  - User Email:', req.userEmail);

    // Validate ObjectId format
    if (!ObjectId.isValid(taskId)) {
      console.error('❌ Invalid ObjectId format:', taskId);
      return res.status(400).json({ 
        message: 'Invalid task ID format',
        receivedId: taskId,
        idLength: taskId.length
      });
    }

    const db = await connectDB();
    
    // Check if user has permission (owner OR collaborator)
    const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const isOwner = task.userId.toString() === req.userId.toString();
    const isCollaborator = task.collaborators && task.collaborators.includes(req.userEmail);
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Not authorized to edit this task' });
    }

    console.log('🔍 Authorization check:', { isOwner, isCollaborator });

    const {
      title,
      date,
      startTime,
      endTime,
      collaborators,
      priority,
      recurring,
      section
    } = req.body;

    // PRIVACY VALIDATION: Check new collaborators
    if (collaborators && collaborators.length > 0) {
      const collaboratorUsers = await db.collection('users')
        .find({ 
          email: { $in: collaborators },
          privacy: { $ne: 'public' }
        })
        .toArray();
      
      if (collaboratorUsers.length > 0) {
        const privateUsers = collaboratorUsers.map(u => u.email);
        return res.status(403).json({ 
          message: 'Some users have private profiles and cannot be added as collaborators',
          privateUsers 
        });
      }
    }

    const updatedTask = {
      title,
      date,
      startTime,
      endTime,
      collaborators,
      priority,
      recurring,
      section,
      updatedAt: new Date()
    };

    const result = await db.collection('tasks').findOneAndUpdate(
      { 
        _id: new ObjectId(taskId),
        status: { $nin: ['Deleted'] }
      },
      { $set: updatedTask },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ message: 'Task not found or deleted' });
    }

    console.log('✅ Task updated successfully');
    
    // NOTIFICATION: Check if updated task starts soon and send immediate notification
    try {
      const notificationService = require('../services/notificationService');
      await notificationService.checkImmediateNotification(result.value, req.userEmail);
    } catch (notifError) {
      console.error('⚠️ Notification error (non-blocking):', notifError);
      // Don't fail the task update if notification fails
    }
    
    res.json(result.value);
  } catch (err) {
    console.error('❌ PUT /tasks/:id error:', err);
    res.status(500).json({ 
      message: 'Failed to update task', 
      error: err.message
    });
  }
});

// UPDATED: Soft delete with collaborative authorization
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    console.log('🗑️ DELETE request for task ID:', taskId);
    
    if (!ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const db = await connectDB();
    
    // Check authorization (owner OR collaborator can delete)
    const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const isOwner = task.userId.toString() === req.userId.toString();
    const isCollaborator = task.collaborators && task.collaborators.includes(req.userEmail);
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    const result = await db.collection('tasks').updateOne(
      { _id: new ObjectId(taskId) },
      { $set: { status: 'Deleted', deletedAt: new Date() } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Failed to delete task' });
    }

    console.log('✅ Task archived successfully');
    res.json({ message: 'Task archived' });
  } catch (err) {
    console.error('❌ Delete task error:', err);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

// UPDATED: Restore with collaborative authorization
router.patch('/restore/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    console.log('🔄 RESTORE request for task ID:', taskId);
    
    if (!ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const db = await connectDB();
    
    // Check authorization
    const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const isOwner = task.userId.toString() === req.userId.toString();
    const isCollaborator = task.collaborators && task.collaborators.includes(req.userEmail);
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Not authorized to restore this task' });
    }

    const result = await db.collection('tasks').updateOne(
      { _id: new ObjectId(taskId) },
      { $set: { status: 'Pending', deletedAt: null } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Restore failed' });
    }

    console.log('✅ Task restored successfully');
    
    // Get the restored task and check for immediate notification
    const restoredTask = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
    if (restoredTask) {
      try {
        const notificationService = require('../services/notificationService');
        await notificationService.checkImmediateNotification(restoredTask, req.userEmail);
      } catch (notifError) {
        console.error('⚠️ Notification error (non-blocking):', notifError);
        // Don't fail the restore if notification fails
      }
    }
    
    res.json({ message: 'Task restored' });
  } catch (err) {
    console.error('❌ Restore task error:', err);
    res.status(500).json({ message: 'Failed to restore task' });
  }
});

// UPDATED: Patch with collaborative authorization
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    console.log('🔧 PATCH request for task ID:', taskId);
    
    if (!ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const db = await connectDB();
    
    // Check authorization
    const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const isOwner = task.userId.toString() === req.userId.toString();
    const isCollaborator = task.collaborators && task.collaborators.includes(req.userEmail);
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Not authorized to modify this task' });
    }

    const { status, deletedAt, recurring } = req.body;

    const updateFields = {};
    if (status !== undefined) updateFields.status = status;
    if (deletedAt !== undefined) updateFields.deletedAt = deletedAt;
    if (recurring !== undefined) updateFields.recurring = recurring;

    console.log('🔧 Patch update fields:', updateFields);

    const result = await db.collection('tasks').findOneAndUpdate(
      { _id: new ObjectId(taskId) },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ message: 'Task not found' });
    }

    console.log('✅ Task patched successfully');
    res.json(result.value);
  } catch (err) {
    console.error('❌ Patch task error:', err);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// UPDATED: Permanent delete with collaborative authorization
router.delete('/permanent/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    console.log('💀 PERMANENT DELETE request for task ID:', taskId);
    
    if (!ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const db = await connectDB();
    
    // Check authorization
    const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const isOwner = task.userId.toString() === req.userId.toString();
    const isCollaborator = task.collaborators && task.collaborators.includes(req.userEmail);
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    const result = await db.collection('tasks').deleteOne({
      _id: new ObjectId(taskId)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Failed to permanently delete task' });
    }

    console.log('✅ Task permanently deleted');
    res.json({ message: 'Task permanently deleted' });
  } catch (err) {
    console.error('❌ Permanent delete error:', err);
    res.status(500).json({ message: 'Failed to permanently delete task' });
  }
});

module.exports = router;