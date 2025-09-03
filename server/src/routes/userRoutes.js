const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

// Get current user profile
router.get('/profile', verifyToken, userController.getCurrentUser);

// Update user profile
router.put('/profile', verifyToken, userController.updateUserProfile);

module.exports = router;