// test/tasks.test.js
const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { ObjectId, MongoClient } = require('mongodb');

// Create a test app
const testApp = express();
testApp.use(express.json());

// Import the TEST-SPECIFIC tasks router (not the production one)
const testTasksRouter = require('./test-tasks-router');
testApp.use('/api/tasks', testTasksRouter);

describe('Tasks API', () => {
  let testUser;
  let authToken;
  let testTask;
  let testClient;
  let testDb;

  before(async function() {
    this.timeout(15000);
    
    console.log('\n🔗 Setting up Tasks API test database...');
    
    try {
      if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI environment variable is required');
      }

      testClient = new MongoClient(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      
      await testClient.connect();
      testDb = testClient.db(process.env.MONGO_DB_NAME || 'taskmanager_test');
      
      // Make available globally for the tasks router to use
      global.testDb = testDb;
      global.testClient = testClient;
      
      console.log('✅ Tasks API connected to:', testDb.databaseName);
    } catch (error) {
      console.error('❌ Tasks API database setup failed:', error.message);
      throw error;
    }
  });

  after(async function() {
    this.timeout(10000);
    
    try {
      if (testDb) {
        // Clean up test data
        await testDb.collection('users').deleteMany({});
        await testDb.collection('tasks').deleteMany({});
      }
      
      if (testClient) {
        await testClient.close();
        console.log('✅ Tasks API database connection closed');
      }
      
      global.testDb = null;
      global.testClient = null;
    } catch (error) {
      console.error('❌ Tasks API cleanup error:', error);
    }
  });

  beforeEach(async function() {
    this.timeout(5000);
    
    if (!testDb) {
      this.skip();
      return;
    }

    // Create a test user
    testUser = {
      _id: new ObjectId(),
      email: 'testuser@example.com',
      username: 'testuser'
    };

    // Insert test user into database
    await testDb.collection('users').insertOne(testUser);

    // Create auth token
    authToken = jwt.sign(
      { id: testUser._id.toString(), email: testUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('🔧 Test setup complete - User:', testUser.email);
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      const taskData = {
        title: 'Test Task',
        date: '2025-06-15',
        startTime: { hour: 9, minute: 0, period: 'AM' },
        endTime: { hour: 10, minute: 0, period: 'AM' },
        section: 'work',
        priority: 'high'
      };

      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData)
        .expect(201);

      expect(response.body).to.have.property('_id');
      expect(response.body.title).to.equal('Test Task');
      expect(response.body.userId).to.equal(testUser._id.toString());
      expect(response.body.status).to.equal('Pending');

      // Store for cleanup
      testTask = response.body;
    });

    it('should reject unauthorized requests', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      const taskData = {
        title: 'Test Task',
        date: '2025-06-15',
        startTime: { hour: 9, minute: 0, period: 'AM' }
      };

      await request(testApp)
        .post('/api/tasks')
        .send(taskData)
        .expect(401);
    });

    it('should reject invalid tokens', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      const taskData = {
        title: 'Test Task',
        date: '2025-06-15',
        startTime: { hour: 9, minute: 0, period: 'AM' }
      };

      await request(testApp)
        .post('/api/tasks')
        .set('Authorization', 'Bearer invalid-token')
        .send(taskData)
        .expect(403);
    });
  });

  describe('GET /api/tasks', () => {
    beforeEach(async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      // Create a test task
      const taskData = {
        title: 'Get Test Task',
        date: '2025-06-15',
        startTime: { hour: 9, minute: 0, period: 'AM' },
        userId: testUser._id.toString(),
        createdBy: testUser.email,
        status: 'Pending',
        section: 'work',
        createdAt: new Date()
      };

      const result = await testDb.collection('tasks').insertOne(taskData);
      testTask = { ...taskData, _id: result.insertedId };
    });

    it('should get all tasks for authenticated user', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      const response = await request(testApp)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.be.an('array');
      expect(response.body).to.have.length(1);
      expect(response.body[0].title).to.equal('Get Test Task');
      expect(response.body[0].userId).to.equal(testUser._id.toString());
    });

    it('should not return tasks from other users', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      // Create another user's task
      const otherUserTask = {
        title: 'Other User Task',
        date: '2025-06-15',
        startTime: { hour: 10, minute: 0, period: 'AM' },
        userId: new ObjectId().toString(),
        createdBy: 'other@example.com',
        status: 'Pending',
        section: 'work',
        createdAt: new Date()
      };

      await testDb.collection('tasks').insertOne(otherUserTask);

      const response = await request(testApp)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.length(1);
      expect(response.body[0].title).to.equal('Get Test Task');
    });
  });

  describe('PUT /api/tasks/:id', () => {
    beforeEach(async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      // Create a test task
      const taskData = {
        title: 'Original Task',
        date: '2025-06-15',
        startTime: { hour: 9, minute: 0, period: 'AM' },
        userId: testUser._id.toString(),
        createdBy: testUser.email,
        status: 'Pending',
        section: 'work',
        createdAt: new Date()
      };

      const result = await testDb.collection('tasks').insertOne(taskData);
      testTask = { ...taskData, _id: result.insertedId };
    });

    it('should update an existing task', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      const updateData = {
        title: 'Updated Task',
        date: '2025-06-16',
        startTime: { hour: 10, minute: 0, period: 'AM' },
        endTime: { hour: 11, minute: 0, period: 'AM' },
        section: 'personal',
        priority: 'medium'
      };

      const response = await request(testApp)
        .put(`/api/tasks/${testTask._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.title).to.equal('Updated Task');
      expect(response.body.section).to.equal('personal');
      expect(response.body.priority).to.equal('medium');
    });

    it('should return 404 for non-existent task', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      const nonExistentId = new ObjectId();
      const updateData = { title: 'Updated Task' };

      await request(testApp)
        .put(`/api/tasks/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    beforeEach(async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      // Create a test task
      const taskData = {
        title: 'Task to Delete',
        date: '2025-06-15',
        startTime: { hour: 9, minute: 0, period: 'AM' },
        userId: testUser._id.toString(),
        createdBy: testUser.email,
        status: 'Pending',
        section: 'work',
        createdAt: new Date()
      };

      const result = await testDb.collection('tasks').insertOne(taskData);
      testTask = { ...taskData, _id: result.insertedId };
    });

    it('should soft delete a task', async function() {
      if (!testDb) {
        this.skip();
        return;
      }

      const response = await request(testApp)
        .delete(`/api/tasks/${testTask._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).to.equal('Task archived');

      // Verify task is marked as deleted
      const deletedTask = await testDb.collection('tasks')
        .findOne({ _id: testTask._id });
      
      expect(deletedTask.status).to.equal('Deleted');
      expect(deletedTask.deletedAt).to.exist;
    });
  });
});