const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspaceController');
const { verifyToken } = require('../middleware/auth');

// Workspace routes
router.post('/', verifyToken, workspaceController.createWorkspace);
router.get('/user', verifyToken, workspaceController.getUserWorkspaces);
router.get('/:id', verifyToken, workspaceController.getWorkspaceById);
router.get('/:id/members', verifyToken, workspaceController.listMembers);
router.put('/:id', verifyToken, workspaceController.updateWorkspace);
router.delete('/:id', verifyToken, workspaceController.deleteWorkspace);
router.post('/:id/members', verifyToken, workspaceController.addMember);
router.delete('/:id/members/:userId', verifyToken, workspaceController.removeMember);

module.exports = router;