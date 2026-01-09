const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getUsers,
  getDoctors,
  approveDoctor,
  blockDoctor,
  unblockDoctor,
  toggleUserActive,
  getUserById,
  deleteUser,
  updateProfileImage
} = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');

// Apply authentication and admin authorization to all routes
router.use(protect);
router.use(authorize('admin'));

// Dashboard routes
router.get('/stats', getDashboardStats);

// Profile Image
router.post('/profile/image', upload.single('profileImage'), updateProfileImage);

// User management routes
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/toggle-active', toggleUserActive);
router.delete('/users/:id', deleteUser);

// Doctor management routes
router.get('/doctors', getDoctors);
router.put('/doctors/:id/approve', approveDoctor);
router.put('/doctors/:id/block', blockDoctor);
router.put('/doctors/:id/unblock', unblockDoctor);

module.exports = router;