const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'taskmanager';

let cachedClient = null;
let cachedDb = null;

async function connectDB() {
  if (cachedDb) return cachedDb;

  if (!uri) {
    throw new Error('❌ Missing MONGO_URI in environment variables');
  }

  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // Optional: avoid hanging forever
      });
      await cachedClient.connect();
      console.log('✅ MongoDB connected successfully');
    }

    cachedDb = cachedClient.db(dbName);
    return cachedDb;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    throw new Error('Failed to connect to MongoDB');
  }
}

module.exports = connectDB;
