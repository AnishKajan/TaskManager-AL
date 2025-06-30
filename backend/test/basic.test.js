// test/basic.test.js
const { expect } = require('chai');
const { MongoClient } = require('mongodb');

describe('Basic Setup Tests', () => {
  let testClient;
  let testDb;

  before(async function() {
    this.timeout(15000);
    
    console.log('\n🔗 Setting up database connection...');
    
    try {
      if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI not found');
      }

      testClient = new MongoClient(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      
      await testClient.connect();
      testDb = testClient.db(process.env.MONGO_DB_NAME || 'taskmanager_test');
      global.testDb = testDb;
      
      console.log('✅ Connected to:', testDb.databaseName);
    } catch (error) {
      console.error('❌ Database setup failed:', error.message);
      throw error;
    }
  });

  after(async function() {
    if (testClient) {
      await testClient.close();
      console.log('✅ Database connection closed');
    }
  });

  it('should run basic test', () => {
    expect(true).to.be.true;
  });

  it('should perform basic JavaScript operations', () => {
    const add = (a, b) => a + b;
    expect(add(2, 3)).to.equal(5);
  });

  it('should handle environment variables correctly', () => {
    console.log('\n🔧 Environment variables:');
    console.log('  NODE_ENV:', process.env.NODE_ENV);
    console.log('  MONGO_DB_NAME:', process.env.MONGO_DB_NAME);
    console.log('  MONGO_URI exists:', !!process.env.MONGO_URI);
    console.log('  MONGO_URI includes test:', process.env.MONGO_URI?.includes('test'));
    
    expect(process.env.NODE_ENV).to.equal('test');
    expect(process.env.MONGO_DB_NAME).to.equal('taskmanager_test');
    expect(process.env.MONGO_URI).to.include('taskmanager_test');
  });

  it('should have access to test database', function() {
    console.log('\n🔍 Database connection check:');
    console.log('  global.testDb exists:', !!global.testDb);
    console.log('  Type:', typeof global.testDb);
    
    expect(global.testDb, 'Database connection should exist').to.exist;
    
    if (global.testDb) {
      console.log('  Database name:', global.testDb.databaseName);
      console.log('  Is test database:', global.testDb.databaseName.includes('test'));
      
      // Verify it's actually a test database
      const dbName = global.testDb.databaseName;
      expect(dbName, 'Should be connected to a test database').to.satisfy(
        name => name === 'taskmanager_test' || name.includes('test')
      );
    }
  });

  it('should connect to database and perform operations', async function() {
    this.timeout(10000);
    
    // Check if database connection exists
    if (!global.testDb) {
      console.log('⏭️  Skipping database operations test - no connection');
      this.skip();
      return;
    }
    
    const db = global.testDb;
    const testCollection = db.collection('test_basic');
    
    try {
      console.log('\n🧪 Testing database operations...');
      
      // Insert a test document
      const insertResult = await testCollection.insertOne({ 
        test: 'basic_test', 
        timestamp: new Date(),
        number: 42
      });
      
      expect(insertResult.insertedId).to.exist;
      console.log('  ✅ Document inserted with ID:', insertResult.insertedId);
      
      // Query the document
      const foundDoc = await testCollection.findOne({ test: 'basic_test' });
      expect(foundDoc).to.exist;
      expect(foundDoc.test).to.equal('basic_test');
      expect(foundDoc.number).to.equal(42);
      console.log('  ✅ Document found and verified');
      
      // Update the document
      const updateResult = await testCollection.updateOne(
        { test: 'basic_test' },
        { $set: { updated: true } }
      );
      expect(updateResult.modifiedCount).to.equal(1);
      console.log('  ✅ Document updated');
      
      // Verify update
      const updatedDoc = await testCollection.findOne({ test: 'basic_test' });
      expect(updatedDoc.updated).to.be.true;
      console.log('  ✅ Update verified');
      
      // Delete the document
      const deleteResult = await testCollection.deleteOne({ test: 'basic_test' });
      expect(deleteResult.deletedCount).to.equal(1);
      console.log('  ✅ Document deleted');
      
      // Verify deletion
      const deletedDoc = await testCollection.findOne({ test: 'basic_test' });
      expect(deletedDoc).to.be.null;
      console.log('  ✅ Deletion verified');
      
      console.log('🎉 All database operations successful!');
      
    } catch (error) {
      console.error('❌ Database operation failed:', error.message);
      throw error;
    }
  });
});