const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connectDB = require('../db/mongoClient');

const router = express.Router();

// Signup Route
router.post('/signup', async (req, res) => {
  try {
    const db = await connectDB();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'Account already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Extract username from email (part before @)
    const username = normalizedEmail.split('@')[0];

    const result = await db.collection('users').insertOne({
      email: normalizedEmail,
      password: hashedPassword,
      privacy: 'public', // default
      // Default avatar settings
      username: username,
      avatarColor: '#607d8b', // grey color
      avatarImage: null
    });

    res.status(201).json({
      message: 'Signup successful',
      user: { email: normalizedEmail, id: result.insertedId }
    });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Server error during signup' });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    const db = await connectDB();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.collection('users').findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: 'Account not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect Password' });
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email // IMPORTANT: Include email in token payload
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.status(200).json({
      token,
      email: user.email // frontend expects this for localStorage
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
