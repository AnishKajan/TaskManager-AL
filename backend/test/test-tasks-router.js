// test/test-tasks-router.js
// This is a copy of your tasks router specifically for testing
// It includes the bug fix for the PUT route without affecting your production code

const express = require('express');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

const router = express.Router();

// Use the test database directly instead of connectDB
const getTestDB = () => {
  if (!global.testDb) {
    throw new Error('Test database not available');
  }
  return global.testDb;
};

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

// Get all non-archived tasks for the logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getTestDB();
    console.log('🔍 Fetching tasks for user:', req.userId);
    
    const tasks = await db.collection('tasks')
      .find({ 
        userId: req.userId,
        status: { $nin: ['Deleted'] }
      })
      .sort({ 
        'date': 1, 
        'startTime.period': 1, 
        'startTime.hour': 1, 
        'startTime.minute': 1 
      })
      .toArray();

    console.log(`✅ Found ${tasks.length} tasks`);
    res.json(tasks);
  } catch (err) {
    console.error('❌ Get tasks error:', err);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// Create a new task
router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = getTestDB();
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

    console.log('📝 Creating task:', { title, section, userId: req.userId });

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
    res.status(201).json(createdTask);
  } catch (err) {
    console.error('❌ Create task error:', err);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// FIXED PUT route for testing
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    console.log('🔍 PUT request details:');
    console.log('  - Task ID:', taskId);
    console.log('  - User ID:', req.userId);

    if (!ObjectId.isValid(taskId)) {
      console.error('❌ Invalid ObjectId format:', taskId);
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const db = getTestDB();
    
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
        userId: req.userId,
        status: { $nin: ['Deleted'] }
      },
      { $set: updatedTask },
      { returnDocument: 'after' }
    );

    // FIX: Handle both old and new MongoDB driver response formats
    const updatedDocument = result?.value || result;

    if (!updatedDocument) {
      console.error('❌ Task not found or not authorized');
      return res.status(404).json({ message: 'Task not found or not authorized' });
    }

    console.log('✅ Task updated successfully');
    res.json(updatedDocument);
  } catch (err) {
    console.error('❌ PUT /tasks/:id error:', err);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// Soft delete (archive) a task
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    console.log('🗑️ DELETE request for task ID:', taskId);
    
    if (!ObjectId.isValid(taskId)) {
      console.error('❌ Invalid ObjectId format:', taskId);
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const db = getTestDB();
    const result = await db.collection('tasks').updateOne(
      { _id: new ObjectId(taskId), userId: req.userId },
      { $set: { status: 'Deleted', deletedAt: new Date() } }
    );

    if (result.modifiedCount === 0) {
      console.error('❌ Delete failed - task not found or not authorized');
      return res.status(404).json({ message: 'Task not found or not authorized' });
    }

    console.log('✅ Task archived successfully');
    res.json({ message: 'Task archived' });
  } catch (err) {
    console.error('❌ Delete task error:', err);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

module.exports = router;