const { initializeFirebaseAdmin, admin } = require('../config/firebase');

// Initialize Firebase
const firebase = initializeFirebaseAdmin();
const db = firebase.firestore();

// Create a new workspace
exports.createWorkspace = async (req, res) => {
  try {
    const { name, description = '' } = req.body;
    const userId = req.user.uid;

    if (!name) return res.status(400).json({ message: 'Name is required' });

    // Ensure user exists
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ message: 'User not found' });

    const wsRef = db.collection('workspaces').doc();
    const workspaceId = wsRef.id;
    const now = admin.firestore.FieldValue.serverTimestamp();

    const data = {
      id: workspaceId,
      name,
      description,
      owner: userId,
      members: [userId],
      videos: [],
      createdAt: now,
      updatedAt: now,
    };

    await wsRef.set(data);

    // Add reference to user doc
    await userRef.update({
      workspaces: admin.firestore.FieldValue.arrayUnion(workspaceId),
      updatedAt: now,
    });

    return res.status(201).json(data);
  } catch (error) {
    console.error('Error creating workspace:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all workspaces for a user
exports.getUserWorkspaces = async (req, res) => {
  try {
    const userId = req.user.uid;

    const snap = await db
      .collection('workspaces')
      .where('members', 'array-contains', userId)
      .get();

    const workspaces = [];
    snap.forEach((doc) => workspaces.push({ id: doc.id, ...doc.data() }));

    return res.status(200).json(workspaces);
  } catch (error) {
    console.error('Error getting user workspaces:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get workspace by ID
exports.getWorkspaceById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    const wsRef = db.collection('workspaces').doc(id);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = wsDoc.data();
    const isMember = ws.owner === userId || (Array.isArray(ws.members) && ws.members.includes(userId));
    if (!isMember) return res.status(403).json({ message: 'Not authorized to access this workspace' });

    return res.status(200).json({ id: wsDoc.id, ...ws });
  } catch (error) {
    console.error('Error getting workspace:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update workspace
exports.updateWorkspace = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user.uid;

    const wsRef = db.collection('workspaces').doc(id);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = wsDoc.data();
    if (ws.owner !== userId) return res.status(403).json({ message: 'Not authorized to update this workspace' });

    const update = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (name) update.name = name;
    if (typeof description === 'string') update.description = description;

    await wsRef.update(update);
    const updatedDoc = await wsRef.get();
    return res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error('Error updating workspace:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add member to workspace
exports.addMember = async (req, res) => {
  try {
    const { id } = req.params; // workspace id
    const { email } = req.body;
    const requesterId = req.user.uid;

    if (!email) return res.status(400).json({ message: 'Email is required' });

    const wsRef = db.collection('workspaces').doc(id);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = wsDoc.data();
    if (ws.owner !== requesterId) return res.status(403).json({ message: 'Not authorized to add members' });

    // Find user by email
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userSnap.empty) return res.status(404).json({ message: 'User with that email not found' });
    const userToAddDoc = userSnap.docs[0];
    const userToAdd = { uid: userToAddDoc.id, ...userToAddDoc.data() };

    if (Array.isArray(ws.members) && ws.members.includes(userToAdd.uid)) {
      return res.status(400).json({ message: 'User is already a member of this workspace' });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await wsRef.update({
      members: admin.firestore.FieldValue.arrayUnion(userToAdd.uid),
      updatedAt: now,
    });

    await db
      .collection('users')
      .doc(userToAdd.uid)
      .update({ workspaces: admin.firestore.FieldValue.arrayUnion(id), updatedAt: now });

    const updated = await wsRef.get();
    return res.status(200).json({ id: updated.id, ...updated.data() });
  } catch (error) {
    console.error('Error adding member to workspace:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Remove member from workspace
exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params; // workspace id, member uid
    const requesterId = req.user.uid;

    const wsRef = db.collection('workspaces').doc(id);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = wsDoc.data();
    if (ws.owner !== requesterId) return res.status(403).json({ message: 'Not authorized to remove members' });

    const now = admin.firestore.FieldValue.serverTimestamp();
    await wsRef.update({
      members: admin.firestore.FieldValue.arrayRemove(userId),
      updatedAt: now,
    });

    // Remove workspace from user's workspaces
    const memberRef = db.collection('users').doc(userId);
    const memberDoc = await memberRef.get();
    if (memberDoc.exists) {
      await memberRef.update({ workspaces: admin.firestore.FieldValue.arrayRemove(id), updatedAt: now });
    }

    return res.status(200).json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member from workspace:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// List members for a workspace (owner and members with basic profile)
exports.listMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.uid;

    const wsRef = db.collection('workspaces').doc(id);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = wsDoc.data();
    const isMember = ws.owner === requesterId || (Array.isArray(ws.members) && ws.members.includes(requesterId));
    if (!isMember) return res.status(403).json({ message: 'Not authorized to view members' });

    const uids = Array.from(new Set([ws.owner, ...(ws.members || [])]));

    // Fetch user docs individually to avoid 'in' limitation and keep it simple
    const users = [];
    await Promise.all(
      uids.map(async (uid) => {
        const uRef = db.collection('users').doc(uid);
        const uDoc = await uRef.get();
        if (uDoc.exists) {
          const u = uDoc.data();
          users.push({
            uid,
            email: u.email || '',
            displayName: u.displayName || '',
            photoURL: u.photoURL || '',
            role: u.role || 'creator',
            isOwner: uid === ws.owner,
          });
        }
      })
    );

    // Owner first, then others alphabetically by displayName
    users.sort((a, b) => (a.isOwner === b.isOwner ? (a.displayName || '').localeCompare(b.displayName || '') : a.isOwner ? -1 : 1));

    return res.status(200).json(users);
  } catch (error) {
    console.error('Error listing members:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete workspace
exports.deleteWorkspace = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.uid;

    const wsRef = db.collection('workspaces').doc(id);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).json({ message: 'Workspace not found' });

    const ws = wsDoc.data();
    if (ws.owner !== requesterId) return res.status(403).json({ message: 'Not authorized to delete this workspace' });

    const batch = db.batch();

    // Remove workspace from all members and owner
    const affectedUids = Array.from(new Set([ws.owner, ...(ws.members || [])]));
    const now = admin.firestore.FieldValue.serverTimestamp();
    affectedUids.forEach((uid) => {
      const uRef = db.collection('users').doc(uid);
      batch.update(uRef, { workspaces: admin.firestore.FieldValue.arrayRemove(id), updatedAt: now });
    });

    // Optionally: clean up videos metadata referencing this workspace (best-effort)
    // Note: Full cleanup of videos/versions can be added later as needed

    batch.delete(wsRef);
    await batch.commit();

    return res.status(200).json({ message: 'Workspace deleted successfully' });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
