const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspaceController');
const authController = require('../controllers/authController');

// Apply auth middleware to all routes
router.use(authController.verifyToken);

// Get all workspaces for a user
router.get('/', workspaceController.getUserWorkspaces);

// Create a new workspace
router.post('/', workspaceController.createWorkspace);

// Get workspace by ID
router.get('/:id', workspaceController.getWorkspaceById);

// Update workspace
router.put('/:id', workspaceController.updateWorkspace);

// Delete workspace
router.delete('/:id', workspaceController.deleteWorkspace);

// Add member to workspace
router.post('/:id/members', workspaceController.addMember);

// Remove member from workspace
router.delete('/:id/members/:memberId', workspaceController.removeMember);

module.exports = router;