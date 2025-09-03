const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { verifyToken } = require('../middleware/auth');

// Add a comment to a video
router.post('/:videoId', verifyToken, commentController.addComment);

// Get comments for a video
router.get('/:videoId', verifyToken, commentController.getVideoComments);

module.exports = router;