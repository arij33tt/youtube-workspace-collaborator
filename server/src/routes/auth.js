const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Register or login user
router.post('/login', authController.verifyToken, authController.registerOrLoginUser);

// Get current user
router.get('/me', authController.verifyToken, authController.getCurrentUser);

module.exports = router;