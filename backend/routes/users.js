const express = require('express');
const connectDB = require('../db/mongoClient');

const router = express.Router();

// UPDATED: GET /api/users - returns only public users for collaborator dropdown
router.get('/', async (req, res) => {
  try {
    const db = await connectDB();
    
    // PRIVACY FEATURE: Only return users with public privacy setting
    const users = await db
      .collection('users')
      .find(
        { privacy: 'public' }, // Only public users
        { projection: { password: 0 } } // exclude password, include all other fields
      )
      .toArray();
      
    console.log(`✅ Found ${users.length} public users for collaboration`);
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// NEW: GET /api/users/all - returns ALL users (for dashboard avatar display)
// This endpoint is used by Dashboard to show avatars of task creators/collaborators
router.get('/all', async (req, res) => {
  try {
    const db = await connectDB();
    const users = await db
      .collection('users')
      .find({}, { projection: { password: 0 } }) // exclude password, include all other fields
      .toArray();
      
    console.log(`✅ Found ${users.length} total users for avatar display`);
    res.json(users);
  } catch (err) {
    console.error('Error fetching all users:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// PATCH /api/users/privacy - update user privacy (existing endpoint)
router.patch('/privacy', async (req, res) => {
  try {
    const db = await connectDB();
    const { email, privacy } = req.body;

    if (!email || !privacy) return res.status(400).json({ message: 'Missing fields' });

    await db.collection('users').updateOne(
      { email },
      { $set: { privacy } }
    );

    res.json({ message: 'Privacy updated successfully' });
  } catch (err) {
    console.error('Error updating privacy:', err);
    res.status(500).json({ message: 'Failed to update privacy' });
  }
});

// PATCH /api/users/profile - update user profile settings (existing endpoint for SettingsModal)
router.patch('/profile', async (req, res) => {
  try {
    const db = await connectDB();
    const { email, privacy, username, avatarColor, avatarImage } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const updateData = {
      privacy: privacy || 'public',
      username: username || email.split('@')[0],
      avatarColor: avatarColor || '#607d8b',
      avatarImage: avatarImage || null
    };

    const result = await db.collection('users').updateOne(
      { email: email.toLowerCase() },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ 
      message: 'Profile updated successfully',
      user: { email, ...updateData }
    });
  } catch (err) {
    console.error('Failed to update profile:', err);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// GET /api/users/:email - get specific user by email (optional)
router.get('/:email', async (req, res) => {
  try {
    const db = await connectDB();
    const { email } = req.params;
    
    const user = await db.collection('users').findOne(
      { email: email.toLowerCase() },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error('Failed to fetch user:', err);
    res.status(500).json({ message: 'Server error fetching user' });
  }
});

module.exports = router;