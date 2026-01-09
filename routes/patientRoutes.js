const express = require('express');
const router = express.Router();
const {
  getDoctors,
  bookAppointment,
  getPatientAppointments,
  cancelAppointment,
  getPatientProfile,
  updatePatientProfile,
  updateProfileImage
} = require('../controllers/patientController');

const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');

// All patient routes require authentication
router.use(protect);

// Doctor listing
router.get('/doctors', authorize('patient'), getDoctors);

// Appointment management
router.route('/appointments')
  .get(authorize('patient'), getPatientAppointments)
  .post(authorize('patient'), bookAppointment);

router.put('/appointments/:id/cancel', authorize('patient'), cancelAppointment);

// Patient Profile routes
router.route('/profile')
  .get(authorize('patient'), getPatientProfile)
  .get(authorize('patient'), getPatientProfile)
  .put(authorize('patient'), updatePatientProfile);

// Profile Image
router.post('/profile/image', authorize('patient'), upload.single('profileImage'), updateProfileImage);

module.exports = router;