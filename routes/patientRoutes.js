const express = require('express');
const router = express.Router();
const {
  getDoctors,
  bookAppointment,
  getPatientAppointments,
  cancelAppointment
} = require('../controllers/patientController');

const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// All patient routes require authentication
router.use(protect);

// Doctor listing
router.get('/doctors', authorize('patient'), getDoctors);

// Appointment management
router.route('/appointments')
  .get(authorize('patient'), getPatientAppointments)
  .post(authorize('patient'), bookAppointment);

router.put('/appointments/:id/cancel', authorize('patient'), cancelAppointment);

module.exports = router;