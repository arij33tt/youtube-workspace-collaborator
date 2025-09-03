const { admin, initializeFirebaseAdmin } = require('../config/firebase');

// Initialize Firebase
const firebase = initializeFirebaseAdmin();
const db = firebase.firestore();

// Verify Firebase token middleware
exports.verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Register or login user
exports.registerOrLoginUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { uid, email, name, picture } = req.user; // Firebase ID token standard fields

    // Fetch latest user record in case token lacks profile fields
    let userRecord = null;
    try {
      userRecord = await admin.auth().getUser(uid);
    } catch (_) {}

    // Prefer token fields; then Admin SDK record; then client payload
    const safeDisplayName = ((name || userRecord?.displayName || req.body?.displayName || '') + '').trim();
    const safePhotoURL = picture || userRecord?.photoURL || req.body?.photoURL || '';
    const safeEmail = email || userRecord?.email || req.body?.email || '';

    // Check if user exists
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    let userData;

    if (!userDoc.exists) {
      // Build doc without undefined values
      userData = {
        uid,
        email: safeEmail,
        displayName: safeDisplayName,
        photoURL: safePhotoURL,
        role: 'creator',
        workspaces: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // Remove undefined or empty-string optional fields if needed
      Object.keys(userData).forEach((k) => {
        if (userData[k] === undefined) delete userData[k];
      });

      await userRef.set(userData);
    } else {
      userData = userDoc.data();
      // Fill missing profile fields if absent
      const patch = {};
      if (!userData.displayName && safeDisplayName) patch.displayName = safeDisplayName;
      if (!userData.photoURL && safePhotoURL) patch.photoURL = safePhotoURL;
      if (!userData.email && safeEmail) patch.email = safeEmail;
      if (Object.keys(patch).length) {
        patch.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await userRef.update(patch);
        userData = { ...userData, ...patch };
      }
    }

    res.status(200).json({
      user: {
        uid: userData.uid,
        email: userData.email || safeEmail,
        displayName: userData.displayName || safeDisplayName,
        photoURL: userData.photoURL || safePhotoURL,
        role: userData.role || 'creator',
      },
    });
  } catch (error) {
    console.error('Error in registerOrLoginUser:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const { uid } = req.user;

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Auto-create minimal user document if missing
      const userRecord = await admin.auth().getUser(uid);
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const minimal = {
        uid,
        email: userRecord.email || '',
        displayName: userRecord.displayName || '',
        photoURL: userRecord.photoURL || '',
        role: 'creator',
        workspaces: [],
        createdAt: now,
        updatedAt: now,
      };
      await userRef.set(minimal);
      return res.status(200).json({ user: minimal });
    }

    const userData = userDoc.data();

    res.status(200).json({
      user: {
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    res.status(500).json({ message: 'Server error' });
  }
};