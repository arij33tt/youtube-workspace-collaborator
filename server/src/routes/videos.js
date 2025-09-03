const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { verifyToken } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(verifyToken);

// Create a new video project (not used; we upload + create in one)
// router.post('/', videoController.createVideo);

// Get all videos in a workspace
router.get('/workspace/:workspaceId', videoController.getWorkspaceVideos);

// Get video by ID
router.get('/:videoId', videoController.getVideoById);

// Upload a new version of a video (future: implement) - reuse multer for field 'video'
// router.post('/:videoId/versions', videoController.multerUpload, videoController.uploadVersion);

// Update video status (approve/reject) - to be added later
// router.patch('/:videoId/status', videoController.updateVideoStatus);

// Publish video (stub) - to be added later
// router.post('/:videoId/publish', videoController.publishVideo);

// Delete video - to be added later
// router.delete('/:videoId', videoController.deleteVideo);

module.exports = router;