const { initializeFirebaseAdmin, admin } = require('../config/firebase');

const firebase = initializeFirebaseAdmin();
const db = firebase.firestore();

// Add a comment to a video
const addComment = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { content, timestamp, workspaceId } = req.body;
    const userId = req.user.uid;

    if (!content || timestamp === undefined || !workspaceId) {
      return res.status(400).json({ message: 'Content, timestamp, and workspaceId are required' });
    }

    // Check if video exists
    const videoRef = db.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();
    if (!videoDoc.exists) return res.status(404).json({ message: 'Video not found' });

    // Access check via workspace
    const workspaceRef = db.collection('workspaces').doc(workspaceId);
    const workspaceDoc = await workspaceRef.get();
    if (!workspaceDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = workspaceDoc.data();
    const isMember = ws.owner === userId || (Array.isArray(ws.members) && ws.members.includes(userId));
    if (!isMember) return res.status(403).json({ message: 'You do not have access to this workspace' });

    // Get user data
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ message: 'User not found' });
    const userData = userDoc.data();

    // Create comment
    const commentRef = db.collection('comments').doc();
    const commentData = {
      id: commentRef.id,
      content,
      timestamp,
      videoId,
      workspaceId,
      author: {
        uid: userId,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await commentRef.set(commentData);

    res.status(201).json({
      ...commentData,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get comments for a video
const getVideoComments = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.uid;

    const videoRef = db.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();
    if (!videoDoc.exists) return res.status(404).json({ message: 'Video not found' });
    const videoData = videoDoc.data();

    // Access check via workspace
    const workspaceRef = db.collection('workspaces').doc(videoData.workspaceId);
    const workspaceDoc = await workspaceRef.get();
    if (!workspaceDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = workspaceDoc.data();
    const isMember = ws.owner === userId || (Array.isArray(ws.members) && ws.members.includes(userId));
    if (!isMember) return res.status(403).json({ message: 'You do not have access to this video' });

    // Get comments for this video
    try {
      const commentsQuery = await db
        .collection('comments')
        .where('videoId', '==', videoId)
        .orderBy('timestamp', 'asc')
        .get();

      const comments = [];
      commentsQuery.forEach((doc) => comments.push({ id: doc.id, ...doc.data() }));
      return res.status(200).json(comments);
    } catch (e) {
      // Fallback if composite index is missing
      if (e && (e.code === 9 || /requires an index/i.test(e.message || ''))) {
        const snap = await db
          .collection('comments')
          .where('videoId', '==', videoId)
          .get();
        const comments = [];
        snap.forEach((doc) => comments.push({ id: doc.id, ...doc.data() }));
        comments.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        return res.status(200).json(comments);
      }
      throw e;
    }
  } catch (error) {
    console.error('Error getting video comments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { addComment, getVideoComments };