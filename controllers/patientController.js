const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Patient = require('../models/Patient');
const { sendEmail } = require('../utils/sendEmail');

// ============================================
// 👨‍⚕️ PATIENT APPOINTMENT MANAGEMENT
// ============================================

/**
 * @desc    Get list of available doctors
 * @route   GET /api/patient/doctors
 * @access  Private (Patient only)
 */
const getDoctors = async (req, res) => {
  try {
    // Check if user is a patient
    if (req.user.role !== 'patient') {
      return res.status(403).json({
        success: false,
        error: 'Only patients can view doctors list'
      });
    }

    // Get approved doctors with populated user info
    const doctors = await Doctor.find({ approvedBy: { $ne: null } })
      .populate('userId', 'name email phone profileImage')
      .select('-availableSlots -__v');

    // Format response data
    const formattedDoctors = doctors.map(doctor => ({
      _id: doctor._id,
      name: doctor.userId.name,
      email: doctor.userId.email,
      phone: doctor.userId.phone,
      profileImage: doctor.userId.profileImage,
      specialization: doctor.specialization || 'General Physician',
      experience: doctor.experience || 0,
      qualifications: doctor.qualifications || [],
      licenseNumber: doctor.licenseNumber,
      consultationFee: doctor.consultationFee || 0,
      rating: doctor.ratings?.average || 0,
      totalReviews: doctor.ratings?.count || 0,
      isApproved: !!doctor.approvedBy,
      hospital: doctor.hospital || {}
    }));

    res.status(200).json({
      success: true,
      count: formattedDoctors.length,
      data: formattedDoctors
    });

  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching doctors'
    });
  }
};

/**
 * @desc    Book new appointment
 * @route   POST /api/patient/appointments
 * @access  Private (Patient only)
 */
const bookAppointment = async (req, res) => {
  try {
    // Check if user is a patient
    if (req.user.role !== 'patient') {
      return res.status(403).json({
        success: false,
        error: 'Only patients can book appointments'
      });
    }

    const { doctorId, date, timeSlot, consultationType, notes } = req.body;

    // Validate required fields
    if (!doctorId || !date || !timeSlot) {
      return res.status(400).json({
        success: false,
        error: 'Doctor ID, date, and time slot are required'
      });
    }

    // Check if doctor exists and is approved
    const doctor = await Doctor.findById(doctorId)
      .populate('userId', 'name email');

    if (!doctor || !doctor.approvedBy) {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found or not approved'
      });
    }

    // Check if the time slot is available (basic validation)
    const appointmentDate = new Date(date);
    if (appointmentDate < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot book appointments in the past'
      });
    }

    // Get consultation fee
    const consultationFee = doctor.consultationFee || 0;
    const platformFee = 5.00;
    const totalAmount = consultationFee + platformFee;

    // Create appointment
    const appointment = new Appointment({
      doctorId,
      patientId: req.user._id,
      date: appointmentDate,
      timeSlot,
      consultationType: consultationType || 'online',
      status: 'pending',
      paymentStatus: 'pending',
      amount: totalAmount,
      notes: notes || ''
    });

    await appointment.save();

    // Populate for response
    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate('doctorId', 'consultationFee')
      .populate('patientId', 'name email');

    // Send email to patient
    const patientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #2563eb; text-align: center;">Appointment Booked Successfully!</h2>
        <p>Hello ${req.user.name},</p>
        <p>Your appointment has been booked with the following details:</p>
        
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p><strong>Doctor:</strong> Dr. ${doctor.userId.name}</p>
          <p><strong>Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
          <p><strong>Time Slot:</strong> ${timeSlot}</p>
          <p><strong>Consultation Type:</strong> ${consultationType}</p>
          <p><strong>Consultation Fee:</strong> $${consultationFee}</p>
          <p><strong>Appointment ID:</strong> ${appointment._id}</p>
        </div>
        
        <p><strong>Next Steps:</strong></p>
        <ul>
          <li>Wait for doctor confirmation</li>
          <li>Complete payment when requested</li>
          <li>Join the consultation at scheduled time</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/patient/appointments" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Appointment Details
          </a>
        </div>
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          If you need to cancel or reschedule, please do so at least 24 hours in advance.
        </p>
      </div>
    `;

    // Send email to doctor
    const doctorHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #2563eb; text-align: center;">New Appointment Request</h2>
        <p>Hello Dr. ${doctor.userId.name},</p>
        <p>You have a new appointment request from a patient:</p>
        
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p><strong>Patient:</strong> ${req.user.name}</p>
          <p><strong>Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
          <p><strong>Time Slot:</strong> ${timeSlot}</p>
          <p><strong>Consultation Type:</strong> ${consultationType}</p>
          <p><strong>Patient Notes:</strong> ${notes || 'No notes provided'}</p>
          <p><strong>Appointment ID:</strong> ${appointment._id}</p>
        </div>
        
        <p><strong>Action Required:</strong></p>
        <ul>
          <li>Review the appointment request</li>
          <li>Confirm or reject within 24 hours</li>
          <li>Prepare for the consultation</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/doctor/appointments" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Manage Appointment
          </a>
        </div>
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          This is an automated notification. Please do not reply to this email.
        </p>
      </div>
    `;

    // Send emails (in background, don't await)
    Promise.allSettled([
      sendEmail({
        email: req.user.email,
        subject: `Appointment Confirmation - Dr. ${doctor.userId.name}`,
        html: patientHtml
      }),
      sendEmail({
        email: doctor.userId.email,
        subject: `New Appointment Request - ${req.user.name}`,
        html: doctorHtml
      })
    ]).then(results => {
      console.log('Email sending results:', results.map(r => r.status));
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully. Check your email for confirmation.',
      data: {
        appointment: populatedAppointment,
        nextSteps: [
          'Wait for doctor confirmation',
          'Complete payment when requested',
          'Check email for updates'
        ]
      }
    });

  } catch (error) {
    console.error('Book appointment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while booking appointment'
    });
  }
};

/**
 * @desc    Get patient's appointments
 * @route   GET /api/patient/appointments
 * @access  Private (Patient only)
 */
const getPatientAppointments = async (req, res) => {
  try {
    // Check if user is a patient
    if (req.user.role !== 'patient') {
      return res.status(403).json({
        success: false,
        error: 'Only patients can view appointments'
      });
    }

    const appointments = await Appointment.find({ patientId: req.user._id })
      .populate('doctorId', 'specialization consultationFee')
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name profileImage'
        }
      })
      .sort({ date: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments
    });

  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching appointments'
    });
  }
};

/**
 * @desc    Cancel appointment
 * @route   PUT /api/patient/appointments/:id/cancel
 * @access  Private (Patient only)
 */
const cancelAppointment = async (req, res) => {
  try {
    // Check if user is a patient
    if (req.user.role !== 'patient') {
      return res.status(403).json({
        success: false,
        error: 'Only patients can cancel appointments'
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Check if appointment belongs to patient
    if (appointment.patientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this appointment'
      });
    }

    // Check if appointment can be cancelled
    if (['cancelled', 'completed', 'rejected'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        error: `Appointment is already ${appointment.status}`
      });
    }

    // Check cancellation window (24 hours)
    const appointmentDate = new Date(appointment.date);
    const hoursUntilAppointment = (appointmentDate - new Date()) / (1000 * 60 * 60);

    if (hoursUntilAppointment < 24 && hoursUntilAppointment > 0) {
      return res.status(400).json({
        success: false,
        error: 'Appointments can only be cancelled at least 24 hours in advance'
      });
    }

    // Update appointment
    appointment.status = 'cancelled';
    appointment.reasonForCancellation = reason || 'Patient cancelled';
    await appointment.save();

    // Send notification to doctor
    const doctor = await Doctor.findById(appointment.doctorId)
      .populate('userId', 'email name');

    if (doctor && doctor.userId.email) {
      const doctorHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #dc2626; text-align: center;">Appointment Cancelled</h2>
          <p>Hello Dr. ${doctor.userId.name},</p>
          <p>A patient has cancelled their appointment:</p>
          
          <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p><strong>Patient:</strong> ${req.user.name}</p>
            <p><strong>Original Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
            <p><strong>Time Slot:</strong> ${appointment.timeSlot}</p>
            <p><strong>Cancellation Reason:</strong> ${appointment.reasonForCancellation}</p>
            <p><strong>Appointment ID:</strong> ${appointment._id}</p>
          </div>
          
          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            This time slot is now available for other patients.
          </p>
        </div>
      `;

      sendEmail({
        email: doctor.userId.email,
        subject: `Appointment Cancelled - ${req.user.name}`,
        html: doctorHtml
      }).catch(err => console.error('Failed to send cancellation email:', err));
    }

    res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully',
      data: appointment
    });

  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while cancelling appointment'
    });
  }
};


// Get patient profile
const getPatientProfile = async (req, res) => {
  try {
    const profile = await Patient.findOne({ userId: req.user._id })
      .populate('userId', 'name email phone profileImage');

    if (!profile) {
      // Return user data even if no patient profile exists
      const user = await User.findById(req.user._id).select('name email phone profileImage');
      const defaultProfile = {
        userId: user,
        gender: '',
        age: '',
        bloodGroup: '',
        medicalHistory: [],
        allergies: [],
        medications: [],
        emergencyContact: {}
      };

      // Add profile image URL if exists
      if (user.profileImage) {
        defaultProfile.profileImageUrl = `${req.protocol}://${req.get('host')}/${user.profileImage}`;
        defaultProfile.profileImage = user.profileImage;
      }

      return res.json({
        success: true,
        data: defaultProfile,
        message: 'No profile found, returning default'
      });
    }

    // Convert to object and add profile image URL
    const profileData = profile.toObject();

    // Add profile image from User model
    if (profileData.userId?.profileImage) {
      profileData.profileImageUrl = `${req.protocol}://${req.get('host')}/${profileData.userId.profileImage}`;
      profileData.profileImage = profileData.userId.profileImage;
    }

    // Add user details at root level for easier access
    if (profileData.userId) {
      profileData.name = profileData.userId.name;
      profileData.email = profileData.userId.email;
      profileData.phone = profileData.userId.phone;
    }

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update patient profile
const updatePatientProfile = async (req, res) => {
  try {
    const {
      gender,
      age,
      bloodGroup,
      allergies,
      medicalHistory,
      medications,
      emergencyContact
    } = req.body;

    // Validate required fields
    if (!gender || !age || !bloodGroup) {
      return res.status(400).json({
        success: false,
        message: 'Gender, age, and blood group are required'
      });
    }

    let profile = await Patient.findOne({ userId: req.user._id });

    if (!profile) {
      // Create new profile
      profile = new Patient({
        userId: req.user._id,
        gender,
        age,
        bloodGroup,
        allergies: allergies || [],
        medicalHistory: medicalHistory || [],
        medications: medications || [],
        emergencyContact: emergencyContact || {}
      });
    } else {
      // Update existing profile
      profile.gender = gender;
      profile.age = age;
      profile.bloodGroup = bloodGroup;
      profile.allergies = allergies || [];
      profile.medicalHistory = medicalHistory || [];
      profile.medications = medications || [];
      profile.emergencyContact = emergencyContact || {};
    }

    await profile.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update patient profile image
const updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    // Get fs and path module if not already imported (assuming they are needed or imported at top)
    const fs = require('fs');
    const path = require('path');

    const user = await User.findById(req.user._id);

    // Delete old image if exists
    if (user.profileImage) {
      const oldImagePath = path.join(__dirname, '..', user.profileImage);
      if (fs.existsSync(oldImagePath)) {
        try {
          fs.unlinkSync(oldImagePath);
        } catch (err) {
          console.error('Error deleting old image:', err);
        }
      }
    }

    // Update user profile image
    user.profileImage = `uploads/patient-profiles/${req.file.filename}`;
    await user.save();

    res.json({
      success: true,
      message: 'Profile image updated successfully',
      data: {
        profileImage: user.profileImage,
        profileImageUrl: `${req.protocol}://${req.get('host')}/${user.profileImage}`
      }
    });

  } catch (error) {
    // Delete uploaded file if error
    if (req.file) {
      const fs = require('fs');
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting uploaded file:', err);
      }
    }

    console.error('Update profile image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile image'
    });
  }
};

module.exports = {
  getDoctors,
  bookAppointment,
  getPatientAppointments,
  cancelAppointment,
  getPatientProfile,
  updatePatientProfile,
  updateProfileImage
};