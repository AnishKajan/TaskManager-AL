const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'taskmanager';

let cachedClient = null;
let cachedDb = null;

async function connectDB() {
  if (cachedDb) {
    try {
      // Test the connection with a simple ping
      await cachedDb.admin().ping();
      console.log('✅ Using existing MongoDB connection');
      return cachedDb;
    } catch (pingError) {
      console.warn('⚠️ Cached connection failed ping test, reconnecting...', pingError.message);
      cachedClient = null;
      cachedDb = null;
    }
  }

  if (!uri) {
    console.error('❌ Missing MONGO_URI in environment variables');
    console.log('📝 Please ensure your .env file contains:');
    console.log('MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/');
    throw new Error('❌ Missing MONGO_URI in environment variables');
  }

  try {
    console.log('🔄 Establishing new MongoDB connection...');
    
    if (!cachedClient) {
      cachedClient = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        // Additional options for better reliability
        maxPoolSize: 10,
        retryWrites: true,
        w: 'majority'
      });
      
      await cachedClient.connect();
      console.log('✅ MongoDB client connected successfully');
    }

    cachedDb = cachedClient.db(dbName);
    
    // Verify database connection by running a simple operation
    await cachedDb.admin().ping();
    console.log(`✅ MongoDB database "${dbName}" connected and verified`);
    
    return cachedDb;
  } catch (err) {
    console.error('❌ MongoDB connection error details:', {
      message: err.message,
      code: err.code,
      codeName: err.codeName
    });
    
    // Reset cached connections on error
    cachedClient = null;
    cachedDb = null;
    
    // Provide more specific error messages
    if (err.message.includes('authentication')) {
      throw new Error('❌ MongoDB authentication failed. Please check your username and password in MONGO_URI');
    } else if (err.message.includes('network') || err.message.includes('timeout')) {
      throw new Error('❌ MongoDB network error. Please check your connection and MongoDB Atlas whitelist');
    } else if (err.message.includes('ENOTFOUND')) {
      throw new Error('❌ MongoDB hostname not found. Please check your MONGO_URI format');
    } else {
      throw new Error(`❌ MongoDB connection failed: ${err.message}`);
    }
  }
}

// Graceful shutdown handler
process.on('SIGINT', async () => {
  if (cachedClient) {
    try {
      await cachedClient.close();
      console.log('✅ MongoDB connection closed gracefully');
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error);
    }
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason && reason.message && reason.message.includes('MongoNetworkError')) {
    console.log('🔄 MongoDB network error detected, clearing cached connections');
    cachedClient = null;
    cachedDb = null;
  }
});

module.exports = connectDB;