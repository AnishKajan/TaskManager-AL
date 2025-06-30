const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
require('dotenv').config();

(async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('taskmanager');
  const hashed = await bcrypt.hash('taskpass123', 10);
  await db.collection('users').insertOne({
    username: 'taskuser',
    email: 'taskuser@example.com',
    password: hashed
  });
  console.log(' User inserted');
  await client.close();
})();
