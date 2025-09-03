const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { verifyToken } = require('../middleware/auth');

// Video routes
router.post('/upload', verifyToken, (req, res, next) => {
  videoController.multerUpload(req, res, (err) => {
    if (err) {
      // Ensure JSON error instead of HTML
      return res.status(400).json({ message: err.message || 'Upload error' });
    }
    next();
  });
}, videoController.uploadVideo);
router.post('/:videoId/versions', verifyToken, (req, res, next) => {
  videoController.multerUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload error' });
    }
    next();
  });
}, videoController.uploadVersion);
router.patch('/:videoId/status', verifyToken, videoController.updateVideoStatus);
router.post('/:videoId/publish', verifyToken, videoController.publishVideo);
router.get('/workspace/:workspaceId', verifyToken, videoController.getWorkspaceVideos);
router.get('/:videoId', verifyToken, videoController.getVideoById);

module.exports = router;