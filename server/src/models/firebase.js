// Firebase data models and schema definitions

/**
 * User document structure in Firestore
 * Collection: 'users'
 */
const userModel = {
  uid: '', // Firebase Auth UID
  email: '',
  displayName: '',
  photoURL: '',
  role: '', // 'creator' or 'editor'
  workspaces: [], // Array of workspace IDs
  createdAt: '', // Timestamp
  updatedAt: '' // Timestamp
};

/**
 * Workspace document structure in Firestore
 * Collection: 'workspaces'
 */
const workspaceModel = {
  name: '',
  description: '',
  owner: '', // User UID
  members: [], // Array of user UIDs
  videos: [], // Array of video IDs
  createdAt: '', // Timestamp
  updatedAt: '' // Timestamp
};

/**
 * Video document structure in Firestore
 * Collection: 'videos'
 */
const videoModel = {
  title: '',
  description: '',
  workspace: '', // Workspace ID
  owner: '', // User UID
  status: '', // 'draft', 'in_review', 'approved', 'rejected'
  currentVersion: '', // Current version ID
  published: false,
  createdAt: '', // Timestamp
  updatedAt: '' // Timestamp
};

/**
 * Version document structure in Firestore
 * Collection: 'videos/{videoId}/versions'
 */
const versionModel = {
  versionNumber: 0,
  videoUrl: '',
  uploadedBy: '', // User UID
  comments: [], // Array of comment IDs
  createdAt: '', // Timestamp
};

/**
 * Comment document structure in Firestore
 * Collection: 'videos/{videoId}/versions/{versionId}/comments'
 */
const commentModel = {
  content: '',
  timestamp: 0, // Video timestamp in seconds
  author: '', // User UID
  resolved: false,
  createdAt: '', // Timestamp
};

module.exports = {
  userModel,
  workspaceModel,
  videoModel,
  versionModel,
  commentModel
};