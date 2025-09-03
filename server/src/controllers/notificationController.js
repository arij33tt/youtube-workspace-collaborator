const { initializeFirebaseAdmin } = require('../config/firebase');

const firebase = initializeFirebaseAdmin();
const db = firebase.firestore();

// Create a new notification
exports.createNotification = async (req, res) => {
  try {
    const { userId, type, message, workspaceId, videoId } = req.body;
    const currentUserId = req.user.uid;

    if (!type || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Workspace-wide notifications
    if (workspaceId) {
      const workspaceRef = db.collection('workspaces').doc(workspaceId);
      const workspaceDoc = await workspaceRef.get();
      if (!workspaceDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

      const ws = workspaceDoc.data();
      const members = ws.members || [];

      const batch = db.batch();
      let notificationCount = 0;
      for (const memberId of members) {
        if (memberId !== currentUserId) {
          const nRef = db.collection('notifications').doc();
          batch.set(nRef, {
            userId: memberId,
            type,
            message,
            workspaceId,
            videoId,
            read: false,
            createdAt: new Date(),
          });
          notificationCount++;
        }
      }
      if (notificationCount > 0) await batch.commit();
      return res.status(201).json({ message: `${notificationCount} notifications created successfully` });
    }

    // Individual notification
    const nRef = db.collection('notifications').doc();
    await nRef.set({ userId, type, message, workspaceId, videoId, read: false, createdAt: new Date() });
    return res.status(201).json({ id: nRef.id, message: 'Notification created successfully' });
  } catch (error) {
    console.error('Error creating notification:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get notifications for a user
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.uid;

    const snap = await db
      .collection('notifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    return res.status(200).json(items);
  } catch (error) {
    console.error('Error getting notifications:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Mark a notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.uid;

    const ref = db.collection('notifications').doc(notificationId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ message: 'Notification not found' });
    const data = doc.data();
    if (data.userId !== userId) return res.status(403).json({ message: 'Unauthorized' });

    await ref.update({ read: true });
    return res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.uid;
    const batch = db.batch();

    const snap = await db
      .collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();

    snap.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();

    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
