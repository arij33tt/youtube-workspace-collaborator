const { admin, initializeFirebaseAdmin } = require('../config/firebase');

// Ensure Firebase Admin is initialized and get Firestore
initializeFirebaseAdmin();
const db = admin.firestore();

// Get current user profile
const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.uid;

    // Get user from Firestore
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userData = userDoc.data();

    // Return user data without sensitive information
    res.status(200).json({
      uid: userId,
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      createdAt: userData.createdAt,
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update user profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { displayName, photoURL } = req.body;

    // Validate input
    if (!displayName && !photoURL) {
      return res.status(400).json({ message: 'No update data provided' });
    }

    // Get user reference
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    const updateData = {};
    if (displayName) updateData.displayName = displayName;
    if (photoURL) updateData.photoURL = photoURL;
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await userRef.update(updateData);

    // Get updated user data
    const updatedUserDoc = await userRef.get();
    const updatedUserData = updatedUserDoc.data();

    res.status(200).json({
      uid: userId,
      email: updatedUserData.email,
      displayName: updatedUserData.displayName,
      photoURL: updatedUserData.photoURL,
      updatedAt: new Date().toISOString(), // For immediate client use
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getCurrentUser,
  updateUserProfile,
};