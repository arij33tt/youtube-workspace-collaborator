const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Auth routes
router.post('/register', verifyToken, authController.registerOrLoginUser);
router.get('/me', verifyToken, authController.getCurrentUser);

module.exports = router;