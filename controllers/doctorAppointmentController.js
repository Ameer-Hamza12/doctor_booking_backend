const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const { sendEmail } = require('../utils/sendEmail');

// ============================================
// 👨‍⚕️ DOCTOR APPOINTMENT MANAGEMENT
// ============================================

/**
 * @desc    Get doctor's appointments
 * @route   GET /api/doctor/appointments
 * @access  Private (Doctor only)
 */
const getDoctorAppointments = async (req, res) => {
  try {
    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can view appointments'
      });
    }

    // Find doctor by userId
    const doctor = await Doctor.findOne({ userId: req.user._id });
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    const { status, date } = req.query;
    
    let query = { doctorId: doctor._id };
    
    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Filter by date if provided
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const appointments = await Appointment.find(query)
      .populate('patientId', 'name email phone')
      .sort({ date: 1, createdAt: -1 });

    // Group appointments by status for statistics
    const stats = {
      pending: appointments.filter(a => a.status === 'pending').length,
      confirmed: appointments.filter(a => a.status === 'confirmed').length,
      completed: appointments.filter(a => a.status === 'completed').length,
      cancelled: appointments.filter(a => a.status === 'cancelled').length,
      total: appointments.length
    };

    res.status(200).json({
      success: true,
      data: {
        appointments,
        stats,
        doctor: {
          name: req.user.name,
          specialization: doctor.specialization
        }
      }
    });

  } catch (error) {
    console.error('Get doctor appointments error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching appointments'
    });
  }
};

/**
 * @desc    Update appointment status
 * @route   PUT /api/doctor/appointments/:id/status
 * @access  Private (Doctor only)
 */
const updateAppointmentStatus = async (req, res) => {
  try {
    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can update appointment status'
      });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value'
      });
    }

    // Find doctor
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    // Find appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Check if appointment belongs to this doctor
    if (appointment.doctorId.toString() !== doctor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this appointment'
      });
    }

    // Update appointment
    const oldStatus = appointment.status;
    appointment.status = status;
    appointment.updatedAt = Date.now();
    
    if (notes) {
      appointment.notes = appointment.notes ? 
        `${appointment.notes}\n[Doctor Update: ${new Date().toLocaleString()}] ${notes}` : 
        `[Doctor Update: ${new Date().toLocaleString()}] ${notes}`;
    }

    await appointment.save();

    // Populate for response and email
    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate('patientId', 'name email')
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      });

    // Send email notification to patient
    if (oldStatus !== status && populatedAppointment.patientId.email) {
      const statusColors = {
        confirmed: '#10b981',
        completed: '#3b82f6',
        cancelled: '#dc2626',
        rejected: '#dc2626'
      };

      const statusMessages = {
        confirmed: 'Your appointment has been confirmed by the doctor.',
        completed: 'Your appointment has been marked as completed.',
        cancelled: 'Your appointment has been cancelled by the doctor.',
        rejected: 'Your appointment request has been rejected by the doctor.'
      };

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: ${statusColors[status] || '#2563eb'}; text-align: center;">
            Appointment Status Updated
          </h2>
          <p>Hello ${populatedAppointment.patientId.name},</p>
          <p>${statusMessages[status] || 'Your appointment status has been updated.'}</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p><strong>Doctor:</strong> Dr. ${populatedAppointment.doctorId.userId.name}</p>
            <p><strong>Date:</strong> ${new Date(appointment.date).toLocaleDateString()}</p>
            <p><strong>Time Slot:</strong> ${appointment.timeSlot}</p>
            <p><strong>Old Status:</strong> ${oldStatus}</p>
            <p><strong>New Status:</strong> ${status}</p>
            <p><strong>Appointment ID:</strong> ${appointment._id}</p>
            ${notes ? `<p><strong>Doctor Notes:</strong> ${notes}</p>` : ''}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/patient/appointments" 
               style="background-color: ${statusColors[status] || '#2563eb'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              View Appointment Details
            </a>
          </div>
          
          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            For any questions, please contact the doctor directly.
          </p>
        </div>
      `;

      sendEmail({
        email: populatedAppointment.patientId.email,
        subject: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)} - Dr. ${populatedAppointment.doctorId.userId.name}`,
        html: html
      }).catch(err => console.error('Failed to send status update email:', err));
    }

    res.status(200).json({
      success: true,
      message: `Appointment status updated to ${status}`,
      data: {
        appointment: populatedAppointment,
        oldStatus,
        newStatus: status
      }
    });

  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating appointment status'
    });
  }
};

/**
 * @desc    Get today's appointments for doctor
 * @route   GET /api/doctor/appointments/today
 * @access  Private (Doctor only)
 */
const getTodaysAppointments = async (req, res) => {
  try {
    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can view appointments'
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await Appointment.find({
      doctorId: doctor._id,
      date: { $gte: today, $lt: tomorrow },
      status: { $in: ['confirmed', 'pending'] }
    })
    .populate('patientId', 'name email phone age gender')
    .sort({ date: 1 });

    res.status(200).json({
      success: true,
      data: {
        date: today.toISOString().split('T')[0],
        appointments,
        count: appointments.length
      }
    });

  } catch (error) {
    console.error('Get today appointments error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching today\'s appointments'
    });
  }
};

/**
 * @desc    Get appointment statistics for doctor dashboard
 * @route   GET /api/doctor/appointments/stats
 * @access  Private (Doctor only)
 */
const getAppointmentStats = async (req, res) => {
  try {
    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can view appointment statistics'
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get all appointments for this doctor
    const allAppointments = await Appointment.find({ doctorId: doctor._id });

    // Calculate statistics
    const totalAppointments = allAppointments.length;
    const pendingAppointments = allAppointments.filter(a => a.status === 'pending').length;
    const confirmedAppointments = allAppointments.filter(a => a.status === 'confirmed').length;
    const completedAppointments = allAppointments.filter(a => a.status === 'completed').length;
    const cancelledAppointments = allAppointments.filter(a => a.status === 'cancelled').length;

    // Calculate monthly and yearly totals
    const monthlyAppointments = allAppointments.filter(a => 
      a.date >= startOfMonth
    ).length;

    const yearlyAppointments = allAppointments.filter(a => 
      a.date >= startOfYear
    ).length;

    // Calculate revenue
    const totalRevenue = allAppointments
      .filter(a => a.status === 'completed')
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    const monthlyRevenue = allAppointments
      .filter(a => a.status === 'completed' && a.date >= startOfMonth)
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    // Get unique patients
    const patientIds = [...new Set(allAppointments.map(a => a.patientId.toString()))];
    const totalPatients = patientIds.length;

    // Recent appointments (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentAppointments = await Appointment.find({
      doctorId: doctor._id,
      date: { $gte: sevenDaysAgo }
    })
    .populate('patientId', 'name')
    .sort({ date: -1 })
    .limit(5);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalAppointments,
          totalPatients,
          totalRevenue: Math.round(totalRevenue),
          monthlyRevenue: Math.round(monthlyRevenue),
          averageRating: doctor.ratings?.average || 0
        },
        statusBreakdown: {
          pending: pendingAppointments,
          confirmed: confirmedAppointments,
          completed: completedAppointments,
          cancelled: cancelledAppointments
        },
        timeline: {
          monthly: monthlyAppointments,
          yearly: yearlyAppointments
        },
        recentAppointments
      }
    });

  } catch (error) {
    console.error('Get appointment stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching appointment statistics'
    });
  }
};

module.exports = {
  getDoctorAppointments,
  updateAppointmentStatus,
  getTodaysAppointments,
  getAppointmentStats
};