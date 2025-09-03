const { initializeFirebaseAdmin, admin } = require('../config/firebase');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

// Initialize Firebase
const firebase = initializeFirebaseAdmin();
const db = firebase.firestore();

// Configure multer for video uploads (memory storage)
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const isThumbnail = file.fieldname === 'thumbnail';
    const videoTypes = /mp4|mov|avi|wmv|flv|mkv/;
    const imageTypes = /jpg|jpeg|png|gif|webp/;

    const ext = path.extname(file.originalname || '').toLowerCase();
    const typeOk = isThumbnail
      ? imageTypes.test(file.mimetype || '') || imageTypes.test(ext)
      : videoTypes.test(file.mimetype || '') || videoTypes.test(ext);

    if (typeOk) return cb(null, true);
    return cb(new Error(isThumbnail ? 'Images only allowed for thumbnail' : 'Videos Only!'));
  },
});

// Expose multer middleware separately so routes can chain it (video + optional thumbnail)
exports.multerUpload = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

// Helper: check workspace access
async function ensureWorkspaceAccess(workspaceId, userId) {
  const wsRef = db.collection('workspaces').doc(workspaceId);
  const wsDoc = await wsRef.get();
  if (!wsDoc.exists) {
    return { ok: false, status: 404, message: 'Workspace not found' };
  }
  const ws = wsDoc.data();
  const isMember = ws.owner === userId || (Array.isArray(ws.members) && ws.members.includes(userId));
  if (!isMember) {
    return { ok: false, status: 403, message: 'You do not have access to this workspace' };
  }
  return { ok: true, wsRef, ws };
}

// POST /api/videos/upload
// Creates a new video with first version and uploads the file to Firebase Storage
exports.uploadVideo = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { title, description = '', workspaceId, version = '1' } = req.body;

    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    if (!videoFile) return res.status(400).json({ message: 'No video file uploaded' });
    if (!title || !workspaceId) return res.status(400).json({ message: 'Title and workspaceId are required' });

    // Ensure user exists
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ message: 'User not found' });

    // Access check
    const access = await ensureWorkspaceAccess(workspaceId, userId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const storageMode = (process.env.STORAGE_PROVIDER || 'firebase').toLowerCase();

    // Create video doc
    const videoRef = db.collection('videos').doc();
    const videoId = videoRef.id;

    const now = admin.firestore.FieldValue.serverTimestamp();
    await videoRef.set({
      id: videoId,
      title,
      description,
      workspaceId,
      owner: userId,
      status: 'in_review',
      currentVersion: 1,
      published: false,
      createdAt: now,
      updatedAt: now,
    });

    // Upload to storage
    let videoUrl = null;
    let thumbnailUrl = null;

    if (storageMode === 'local') {
      // Local disk storage
      const baseDir = path.join(__dirname, '..', 'uploads');
      const videoDir = path.join(baseDir, 'videos', workspaceId, videoId);
      const thumbDir = path.join(baseDir, 'thumbnails', workspaceId, videoId);
      await fsp.mkdir(videoDir, { recursive: true });
      await fsp.mkdir(thumbDir, { recursive: true });

      const videoFilename = `${Date.now()}-${videoFile.originalname}`;
      const videoFsPath = path.join(videoDir, videoFilename);
      await fsp.writeFile(videoFsPath, videoFile.buffer);
      const relVideoUrl = `/uploads/videos/${workspaceId}/${videoId}/${videoFilename}`;
      videoUrl = `${req.protocol}://${req.get('host')}${relVideoUrl}`;

      if (thumbFile) {
        const thumbFilename = `${Date.now()}-${thumbFile.originalname}`;
        const thumbFsPath = path.join(thumbDir, thumbFilename);
        await fsp.writeFile(thumbFsPath, thumbFile.buffer);
        const relThumbUrl = `/uploads/thumbnails/${workspaceId}/${videoId}/${thumbFilename}`;
        thumbnailUrl = `${req.protocol}://${req.get('host')}${relThumbUrl}`;
      }
    } else {
      // Firebase Storage
      const storageBucket = admin.storage().bucket();
      const [bucketExists] = await storageBucket.exists();
      if (!bucketExists) {
        return res.status(500).json({
          message: `Storage bucket '${storageBucket.name}' not found. Enable Firebase Storage or set STORAGE_PROVIDER=local in server/.env to save files locally.`,
        });
      }

      const videoPath = `videos/${workspaceId}/${videoId}/${Date.now()}-${videoFile.originalname}`;
      const videoObj = storageBucket.file(videoPath);
      await new Promise((resolve, reject) => {
        const stream = videoObj.createWriteStream({ metadata: { contentType: videoFile.mimetype } });
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(videoFile.buffer);
      });
      const [signedVideoUrl] = await videoObj.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      videoUrl = signedVideoUrl;

      if (thumbFile) {
        const thumbPath = `thumbnails/${workspaceId}/${videoId}/${Date.now()}-${thumbFile.originalname}`;
        const thumbObj = storageBucket.file(thumbPath);
        await new Promise((resolve, reject) => {
          const stream = thumbObj.createWriteStream({ metadata: { contentType: thumbFile.mimetype } });
          stream.on('error', reject);
          stream.on('finish', resolve);
          stream.end(thumbFile.buffer);
        });
        const [signedThumbUrl] = await thumbObj.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        thumbnailUrl = signedThumbUrl;
      }
    }

    // Create first version in subcollection
    const versionsRef = videoRef.collection('versions');
    const versionRef = versionsRef.doc();
    await versionRef.set({
      id: versionRef.id,
      versionNumber: 1,
      title,
      description,
      videoUrl,
      thumbnailUrl,
      fileSize: videoFile.size,
      uploadedBy: userId,
      createdAt: now,
      qualities: [
        { quality: 'source', url: videoUrl }
      ],
    });

    // Optionally append to workspace.videos array (best-effort)
    try {
      await access.wsRef.update({
        videos: admin.firestore.FieldValue.arrayUnion(videoId),
        updatedAt: now,
      });
    } catch (_) {}

    return res.status(201).json({
      video: { id: videoId, workspaceId },
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/videos/workspace/:workspaceId
exports.getWorkspaceVideos = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { workspaceId } = req.params;

    const access = await ensureWorkspaceAccess(workspaceId, userId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    try {
      // Preferred: indexed query for efficient sorting
      const snap = await db
        .collection('videos')
        .where('workspaceId', '==', workspaceId)
        .orderBy('updatedAt', 'desc')
        .get();
      const videos = [];
      snap.forEach((doc) => videos.push({ id: doc.id, ...doc.data() }));
      return res.status(200).json(videos);
    } catch (e) {
      // Fallback: if composite index is missing, fetch without orderBy and sort in memory
      // Create the index for better performance: videos(workspaceId ASC, updatedAt DESC)
      if (e && (e.code === 9 || /requires an index/i.test(e.message || ''))) {
        const snap = await db
          .collection('videos')
          .where('workspaceId', '==', workspaceId)
          .get();
        const videos = [];
        snap.forEach((doc) => videos.push({ id: doc.id, ...doc.data() }));
        // Sort by updatedAt desc (handle Timestamp or missing values)
        const toMillis = (t) => {
          if (!t) return 0;
          try { return typeof t.toMillis === 'function' ? t.toMillis() : new Date(t).getTime() || 0; } catch { return 0; }
        };
        videos.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        return res.status(200).json(videos);
      }
      throw e;
    }
  } catch (error) {
    console.error('Error getting workspace videos:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/videos/:videoId
exports.getVideoById = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { videoId } = req.params;

    const videoRef = db.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();
    if (!videoDoc.exists) return res.status(404).json({ message: 'Video not found' });

    const video = { id: videoDoc.id, ...videoDoc.data() };

    // Access check via workspace
    const access = await ensureWorkspaceAccess(video.workspaceId, userId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    // Get latest version to expose playable URL
    const versionsSnap = await videoRef.collection('versions').orderBy('versionNumber', 'desc').limit(1).get();
    let latestVersion = null;
    versionsSnap.forEach((d) => (latestVersion = { id: d.id, ...d.data() }));

    const payload = {
      ...video,
      url: latestVersion?.videoUrl || null,
      version: latestVersion?.versionNumber || video.currentVersion || 1,
      latestVersion,
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Error getting video:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// POST /api/videos/:videoId/versions
exports.uploadVersion = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { videoId } = req.params;
    const { title = '', description = '' } = req.body;

    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];
    if (!videoFile) return res.status(400).json({ message: 'No video file uploaded' });

    const videoRef = db.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();
    if (!videoDoc.exists) return res.status(404).json({ message: 'Video not found' });
    const video = videoDoc.data();

    // Access check via workspace
    const access = await ensureWorkspaceAccess(video.workspaceId, userId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    // Determine next version number
    const lastSnap = await videoRef.collection('versions').orderBy('versionNumber', 'desc').limit(1).get();
    let nextVersion = 1;
    lastSnap.forEach((d) => { nextVersion = (d.data().versionNumber || 0) + 1; });

    // Upload file to storage
    const storageModeV = (process.env.STORAGE_PROVIDER || 'firebase').toLowerCase();

    let videoUrl = null;
    let thumbnailUrl = null;

    if (storageModeV === 'local') {
      const baseDir = path.join(__dirname, '..', 'uploads');
      const videoDir = path.join(baseDir, 'videos', video.workspaceId, videoId);
      const thumbDir = path.join(baseDir, 'thumbnails', video.workspaceId, videoId);
      await fsp.mkdir(videoDir, { recursive: true });
      await fsp.mkdir(thumbDir, { recursive: true });

      const videoFilename = `${Date.now()}-${videoFile.originalname}`;
      const videoFsPath = path.join(videoDir, videoFilename);
      await fsp.writeFile(videoFsPath, videoFile.buffer);
      const relVideoUrl = `/uploads/videos/${video.workspaceId}/${videoId}/${videoFilename}`;
      videoUrl = `${req.protocol}://${req.get('host')}${relVideoUrl}`;

      if (thumbFile) {
        const thumbFilename = `${Date.now()}-${thumbFile.originalname}`;
        const thumbFsPath = path.join(thumbDir, thumbFilename);
        await fsp.writeFile(thumbFsPath, thumbFile.buffer);
        const relThumbUrl = `/uploads/thumbnails/${video.workspaceId}/${videoId}/${thumbFilename}`;
        thumbnailUrl = `${req.protocol}://${req.get('host')}${relThumbUrl}`;
      }
    } else {
      const bucket = admin.storage().bucket();
      const [bucketExistsV] = await bucket.exists();
      if (!bucketExistsV) {
        return res.status(500).json({
          message: `Storage bucket '${bucket.name}' not found. Enable Firebase Storage or set STORAGE_PROVIDER=local in server/.env to save files locally.`,
        });
      }
      const videoPath = `videos/${video.workspaceId}/${videoId}/${Date.now()}-${videoFile.originalname}`;
      const file = bucket.file(videoPath);
      await new Promise((resolve, reject) => {
        const stream = file.createWriteStream({ metadata: { contentType: videoFile.mimetype } });
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(videoFile.buffer);
      });
      const [signedVideoUrlV] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      videoUrl = signedVideoUrlV;

      if (thumbFile) {
        const thumbPath = `thumbnails/${video.workspaceId}/${videoId}/${Date.now()}-${thumbFile.originalname}`;
        const thumbObj = bucket.file(thumbPath);
        await new Promise((resolve, reject) => {
          const stream = thumbObj.createWriteStream({ metadata: { contentType: thumbFile.mimetype } });
          stream.on('error', reject);
          stream.on('finish', resolve);
          stream.end(thumbFile.buffer);
        });
        const [signedThumbUrlV] = await thumbObj.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        thumbnailUrl = signedThumbUrlV;
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Create version doc
    const versionRef = videoRef.collection('versions').doc();
    const versionPayload = {
      id: versionRef.id,
      versionNumber: nextVersion,
      title: title || `Version ${nextVersion}`,
      description,
      videoUrl,
      thumbnailUrl,
      fileSize: videoFile.size,
      uploadedBy: userId,
      createdAt: now,
      qualities: [
        { quality: 'source', url: videoUrl }
      ],
    };
    await versionRef.set(versionPayload);

    // Update video doc
    await videoRef.update({ currentVersion: nextVersion, updatedAt: now });

    return res.status(201).json({ version: { ...versionPayload, videoUrl } });
  } catch (error) {
    console.error('Error uploading version:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// PATCH /api/videos/:videoId/status
exports.updateVideoStatus = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { videoId } = req.params;
    const { status } = req.body;

    const allowed = ['in_review', 'approved', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const videoRef = db.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();
    if (!videoDoc.exists) return res.status(404).json({ message: 'Video not found' });
    const video = videoDoc.data();

    // Only workspace owner can change status
    const wsRef = db.collection('workspaces').doc(video.workspaceId);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });
    const ws = wsDoc.data();
    if (ws.owner !== userId) return res.status(403).json({ message: 'Not authorized' });

    const now = admin.firestore.FieldValue.serverTimestamp();
    await videoRef.update({ status, updatedAt: now });

    // Create notifications for workspace members (except actor)
    const members = Array.isArray(ws.members) ? ws.members : [];
    const notifyBatch = db.batch();
    const recipients = new Set([...(members || []), ws.owner]);
    recipients.delete(userId);
    recipients.forEach((uid) => {
      const nRef = db.collection('notifications').doc();
      notifyBatch.set(nRef, {
        userId: uid,
        type: status === 'approved' ? 'approval' : 'status',
        message: `Video ${status}: ${video.title}`,
        workspaceId: video.workspaceId,
        videoId,
        read: false,
        createdAt: new Date(),
      });
    });
    await notifyBatch.commit();

    const updated = await videoRef.get();
    return res.status(200).json({ id: updated.id, ...updated.data() });
  } catch (error) {
    console.error('Error updating video status:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// POST /api/videos/:videoId/publish (stub)
exports.publishVideo = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { videoId } = req.params;
    const { title, description, thumbnailUrl } = req.body || {};

    const videoRef = db.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();
    if (!videoDoc.exists) return res.status(404).json({ message: 'Video not found' });
    const video = videoDoc.data();

    // Only workspace owner can publish for now
    const wsRef = db.collection('workspaces').doc(video.workspaceId);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });
    const ws = wsDoc.data();
    if (ws.owner !== userId) return res.status(403).json({ message: 'Not authorized' });

    // Stub: mark as published; later integrate with real YouTube or your custom platform
    const now = admin.firestore.FieldValue.serverTimestamp();
    await videoRef.update({
      published: true,
      status: 'approved',
      updatedAt: now,
      publishMeta: { title: title || video.title, description: description || video.description, thumbnailUrl: thumbnailUrl || null },
    });

    const updated = await videoRef.get();
    return res.status(200).json({ id: updated.id, ...updated.data() });
  } catch (error) {
    console.error('Error publishing video:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
