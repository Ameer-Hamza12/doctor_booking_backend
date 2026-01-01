const express = require('express');
const router = express.Router();
const {
  getDoctorAppointments,
  updateAppointmentStatus,
  getTodaysAppointments,
  getAppointmentStats
} = require('../controllers/doctorAppointmentController');

const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// All doctor appointment routes require authentication
router.use(protect);

// Appointment management
router.get('/appointments', authorize('doctor'), getDoctorAppointments);
router.get('/appointments/today', authorize('doctor'), getTodaysAppointments);
router.get('/appointments/stats', authorize('doctor'), getAppointmentStats);
router.put('/appointments/:id/status', authorize('doctor'), updateAppointmentStatus);

module.exports = router;