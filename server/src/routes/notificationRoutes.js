const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// Create a new notification
router.post('/', verifyToken, notificationController.createNotification);

// Get notifications for the current user
router.get('/', verifyToken, notificationController.getUserNotifications);

// Mark a notification as read
router.put('/:notificationId/read', verifyToken, notificationController.markAsRead);

// Mark all notifications as read
router.put('/read-all', verifyToken, notificationController.markAllAsRead);

module.exports = router;