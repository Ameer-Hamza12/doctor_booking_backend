const express = require('express');
const router = express.Router();
const {
  // Profile Management
  createOrUpdateProfile,
  getProfile,

  // Time Slots Management
  addTimeSlots,
  getTimeSlots,
  updateTimeSlot,
  deleteTimeSlot,
  getAvailableSlotsForPatients,

  // Statistics
  getDoctorStats
} = require('../controllers/doctorController');

const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');

// ============================================
// 🩺 DOCTOR PROFILE ROUTES
// ============================================

// All doctor routes require authentication
router.use(protect);

// Profile management
router.route('/profile')
  .post(authorize('doctor'), upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'documents', maxCount: 3 }
  ]), createOrUpdateProfile)
  .get(authorize('doctor'), getProfile);

// ============================================
// ⏰ TIME SLOTS ROUTES
// ============================================

// Time slots management (doctor only)
router.route('/slots')
  .post(authorize('doctor'), addTimeSlots)
  .get(authorize('doctor'), getTimeSlots);

router.route('/slots/:slotId')
  .put(authorize('doctor'), updateTimeSlot)
  .delete(authorize('doctor'), deleteTimeSlot);

// Public route for patients to view available slots
router.get('/:doctorId/slots/available', getAvailableSlotsForPatients);

// ============================================
// 📊 STATISTICS ROUTES
// ============================================

router.get('/stats', authorize('doctor'), getDoctorStats);

module.exports = router;