const Doctor = require('../models/Doctor');
const User = require('../models/User');

// ============================================
// 🩺 DOCTOR PROFILE MANAGEMENT
// ============================================

/**
 * @desc    Create or update doctor profile
 * @route   POST /api/doctor/profile
 * @access  Private (Doctor only)
 * 
 * 📝 Explanation: When a doctor signs up, they need to complete their profile
 * with qualifications, experience, license, etc. This API handles both
 * creating new profile and updating existing one.
 */
const createOrUpdateProfile = async (req, res) => {
  try {
    const {
      qualifications,
      experience,
      licenseNumber,
      hospital,
      consultationFee
    } = req.body;

    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can create/update doctor profiles'
      });
    }

    // Check if license number is already taken
    if (licenseNumber) {
      const existingDoctor = await Doctor.findOne({ 
        licenseNumber,
        userId: { $ne: req.user._id } // Check other doctors, not current
      });
      
      if (existingDoctor) {
        return res.status(400).json({
          success: false,
          error: 'License number already registered'
        });
      }
    }

    // Create or update doctor profile
    let doctor = await Doctor.findOne({ userId: req.user._id });

    if (doctor) {
      // Update existing profile
      doctor.qualifications = qualifications || doctor.qualifications;
      doctor.experience = experience || doctor.experience;
      doctor.licenseNumber = licenseNumber || doctor.licenseNumber;
      doctor.hospital = hospital || doctor.hospital;
      doctor.consultationFee = consultationFee || doctor.consultationFee;
    } else {
      // Create new profile
      doctor = new Doctor({
        userId: req.user._id,
        qualifications: qualifications || [],
        experience: experience || 0,
        licenseNumber,
        hospital: hospital || {},
        consultationFee: consultationFee || 0,
        availableSlots: [] // Start with empty slots
      });
    }

    await doctor.save();

    res.status(200).json({
      success: true,
      message: doctor.isNew ? 'Doctor profile created' : 'Doctor profile updated',
      data: {
        doctorId: doctor._id,
        userId: doctor.userId,
        qualifications: doctor.qualifications,
        experience: doctor.experience,
        licenseNumber: doctor.licenseNumber,
        hospital: doctor.hospital,
        consultationFee: doctor.consultationFee,
        isApproved: doctor.approvedBy ? true : false
      }
    });

  } catch (error) {
    console.error('Doctor profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while saving doctor profile'
    });
  }
};

/**
 * @desc    Get doctor profile
 * @route   GET /api/doctor/profile
 * @access  Private (Doctor only)
 * 
 * 📝 Explanation: Doctors need to view their complete profile including
 * approval status, ratings, and available slots.
 */
const getProfile = async (req, res) => {
  try {
    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Doctor profile only'
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user._id })
      .populate('approvedBy', 'name email')
      .populate('userId', 'name email phone specialization profileImage isVerified');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found. Please complete your profile first.'
      });
    }

    res.status(200).json({
      success: true,
      data: doctor
    });

  } catch (error) {
    console.error('Get doctor profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching doctor profile'
    });
  }
};

// ============================================
// ⏰ TIME SLOTS MANAGEMENT
// ============================================

/**
 * @desc    Add available time slots
 * @route   POST /api/doctor/slots
 * @access  Private (Doctor only)
 * 
 * 📝 Explanation: Doctors set their available time slots for appointments.
 * Each slot includes day, start time, end time, and availability status.
 * Example: Monday, 9:00 AM - 5:00 PM
 */
const addTimeSlots = async (req, res) => {
  try {
    const { slots } = req.body;

    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can manage time slots'
      });
    }

    // Validate slots data
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least one time slot'
      });
    }

    // Validate each slot
    const validatedSlots = slots.map(slot => {
      // Basic validation
      if (!slot.day || !slot.startTime || !slot.endTime) {
        throw new Error('Each slot must have day, startTime, and endTime');
      }

      // Validate day
      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      if (!validDays.includes(slot.day)) {
        throw new Error(`Invalid day: ${slot.day}. Must be one of: ${validDays.join(', ')}`);
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
        throw new Error('Time must be in HH:MM format (24-hour)');
      }

      // Convert times to Date objects for comparison
      const start = new Date(`1970-01-01T${slot.startTime}:00`);
      const end = new Date(`1970-01-01T${slot.endTime}:00`);
      
      // Check if start time is before end time
      if (start >= end) {
        throw new Error('Start time must be before end time');
      }

      // Check slot duration (minimum 30 minutes)
      const duration = (end - start) / (1000 * 60); // in minutes
      if (duration < 30) {
        throw new Error('Minimum slot duration is 30 minutes');
      }

      return {
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isAvailable: slot.isAvailable !== false // Default to true
      };
    });

    // Find or create doctor profile
    let doctor = await Doctor.findOne({ userId: req.user._id });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found. Please complete your profile first.'
      });
    }

    // Check for overlapping slots
    validatedSlots.forEach(newSlot => {
      const existingSlot = doctor.availableSlots.find(existing => 
        existing.day === newSlot.day &&
        (
          (newSlot.startTime >= existing.startTime && newSlot.startTime < existing.endTime) ||
          (newSlot.endTime > existing.startTime && newSlot.endTime <= existing.endTime) ||
          (newSlot.startTime <= existing.startTime && newSlot.endTime >= existing.endTime)
        )
      );

      if (existingSlot) {
        throw new Error(`Slot overlaps with existing slot: ${existingSlot.day} ${existingSlot.startTime}-${existingSlot.endTime}`);
      }
    });

    // Add new slots to existing slots
    doctor.availableSlots.push(...validatedSlots);
    await doctor.save();

    res.status(200).json({
      success: true,
      message: `Added ${validatedSlots.length} time slot(s)`,
      data: {
        totalSlots: doctor.availableSlots.length,
        newSlots: validatedSlots
      }
    });

  } catch (error) {
    console.error('Add time slots error:', error);
    
    if (error.message.includes('Invalid day') || 
        error.message.includes('Time must be') || 
        error.message.includes('Start time') ||
        error.message.includes('Minimum slot') ||
        error.message.includes('overlaps')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error while adding time slots'
    });
  }
};

/**
 * @desc    Get all time slots
 * @route   GET /api/doctor/slots
 * @access  Private (Doctor only)
 * 
 * 📝 Explanation: Doctors can view all their scheduled time slots.
 * Returns slots grouped by day for easier display.
 */
const getTimeSlots = async (req, res) => {
  try {
    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can view time slots'
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user._id });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    // Group slots by day
    const slotsByDay = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    };

    doctor.availableSlots.forEach(slot => {
      slotsByDay[slot.day].push({
        id: slot._id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isAvailable: slot.isAvailable
      });
    });

    // Remove empty days
    Object.keys(slotsByDay).forEach(day => {
      if (slotsByDay[day].length === 0) {
        delete slotsByDay[day];
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalSlots: doctor.availableSlots.length,
        slotsByDay: slotsByDay,
        allSlots: doctor.availableSlots
      }
    });

  } catch (error) {
    console.error('Get time slots error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching time slots'
    });
  }
};

/**
 * @desc    Update a specific time slot
 * @route   PUT /api/doctor/slots/:slotId
 * @access  Private (Doctor only)
 * 
 * 📝 Explanation: Doctors can update individual time slots.
 * Useful for marking slots as unavailable (on leave) or changing times.
 */
const updateTimeSlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { startTime, endTime, isAvailable } = req.body;

    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can update time slots'
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user._id });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    // Find the slot
    const slotIndex = doctor.availableSlots.findIndex(
      slot => slot._id.toString() === slotId
    );

    if (slotIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Time slot not found'
      });
    }

    const slot = doctor.availableSlots[slotIndex];
    
    // Update fields if provided
    if (startTime !== undefined) {
      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime)) {
        return res.status(400).json({
          success: false,
          error: 'Start time must be in HH:MM format (24-hour)'
        });
      }
      slot.startTime = startTime;
    }

    if (endTime !== undefined) {
      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(endTime)) {
        return res.status(400).json({
          success: false,
          error: 'End time must be in HH:MM format (24-hour)'
        });
      }
      slot.endTime = endTime;
    }

    if (isAvailable !== undefined) {
      slot.isAvailable = isAvailable;
    }

    // Validate times if both were updated
    if (startTime !== undefined || endTime !== undefined) {
      const start = new Date(`1970-01-01T${slot.startTime}:00`);
      const end = new Date(`1970-01-01T${slot.endTime}:00`);
      
      if (start >= end) {
        return res.status(400).json({
          success: false,
          error: 'Start time must be before end time'
        });
      }

      // Check for overlaps with other slots (excluding current slot)
      const hasOverlap = doctor.availableSlots.some((existingSlot, index) => {
        if (index === slotIndex) return false; // Skip current slot
        
        return existingSlot.day === slot.day &&
          (
            (slot.startTime >= existingSlot.startTime && slot.startTime < existingSlot.endTime) ||
            (slot.endTime > existingSlot.startTime && slot.endTime <= existingSlot.endTime) ||
            (slot.startTime <= existingSlot.startTime && slot.endTime >= existingSlot.endTime)
          );
      });

      if (hasOverlap) {
        return res.status(400).json({
          success: false,
          error: 'Updated slot overlaps with existing slot'
        });
      }
    }

    await doctor.save();

    res.status(200).json({
      success: true,
      message: 'Time slot updated successfully',
      data: {
        slot: {
          id: slot._id,
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isAvailable: slot.isAvailable
        }
      }
    });

  } catch (error) {
    console.error('Update time slot error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating time slot'
    });
  }
};

/**
 * @desc    Delete a time slot
 * @route   DELETE /api/doctor/slots/:slotId
 * @access  Private (Doctor only)
 * 
 * 📝 Explanation: Remove a time slot permanently.
 * Use this when a doctor wants to remove a specific time slot.
 */
const deleteTimeSlot = async (req, res) => {
  try {
    const { slotId } = req.params;

    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can delete time slots'
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user._id });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    // Find and remove the slot
    const initialLength = doctor.availableSlots.length;
    doctor.availableSlots = doctor.availableSlots.filter(
      slot => slot._id.toString() !== slotId
    );

    if (doctor.availableSlots.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Time slot not found'
      });
    }

    await doctor.save();

    res.status(200).json({
      success: true,
      message: 'Time slot deleted successfully',
      data: {
        remainingSlots: doctor.availableSlots.length
      }
    });

  } catch (error) {
    console.error('Delete time slot error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting time slot'
    });
  }
};

/**
 * @desc    Get available slots for patients
 * @route   GET /api/doctor/:doctorId/slots/available
 * @access  Public/Private (For patients to book)
 * 
 * 📝 Explanation: Patients can see available time slots for a specific doctor.
 * Only shows slots that are marked as available.
 */
const getAvailableSlotsForPatients = async (req, res) => {
  try {
    const { doctorId } = req.params;

    // Get doctor and populate user info
    const doctor = await Doctor.findById(doctorId)
      .populate('userId', 'name specialization profileImage isVerified isActive');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found'
      });
    }

    // Check if doctor is approved and active
    if (!doctor.approvedBy || !doctor.userId.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Doctor is not available for appointments'
      });
    }

    // Filter only available slots
    const availableSlots = doctor.availableSlots.filter(slot => slot.isAvailable);

    // Group by day
    const slotsByDay = {};
    availableSlots.forEach(slot => {
      if (!slotsByDay[slot.day]) {
        slotsByDay[slot.day] = [];
      }
      slotsByDay[slot.day].push({
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotId: slot._id
      });
    });

    res.status(200).json({
      success: true,
      data: {
        doctor: {
          id: doctor._id,
          name: doctor.userId.name,
          specialization: doctor.userId.specialization,
          consultationFee: doctor.consultationFee,
          experience: doctor.experience,
          ratings: doctor.ratings
        },
        availableSlots: slotsByDay,
        totalAvailableSlots: availableSlots.length
      }
    });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching available slots'
    });
  }
};

// ============================================
// 📊 DOCTOR STATISTICS
// ============================================

/**
 * @desc    Get doctor statistics
 * @route   GET /api/doctor/stats
 * @access  Private (Doctor only)
 * 
 * 📝 Explanation: Doctors can see their statistics like total slots,
 * available slots, ratings, etc.
 */
const getDoctorStats = async (req, res) => {
  try {
    // Check if user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        error: 'Only doctors can view statistics'
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user._id });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor profile not found'
      });
    }

    // Calculate statistics
    const totalSlots = doctor.availableSlots.length;
    const availableSlots = doctor.availableSlots.filter(slot => slot.isAvailable).length;
    const bookedSlots = totalSlots - availableSlots;

    // Group slots by day
    const slotsByDay = {};
    doctor.availableSlots.forEach(slot => {
      if (!slotsByDay[slot.day]) {
        slotsByDay[slot.day] = { total: 0, available: 0 };
      }
      slotsByDay[slot.day].total++;
      if (slot.isAvailable) slotsByDay[slot.day].available++;
    });

    res.status(200).json({
      success: true,
      data: {
        profileStats: {
          isApproved: !!doctor.approvedBy,
          experience: doctor.experience,
          consultationFee: doctor.consultationFee,
          rating: doctor.ratings.average,
          totalReviews: doctor.ratings.count
        },
        slotStats: {
          totalSlots,
          availableSlots,
          bookedSlots,
          availabilityPercentage: totalSlots > 0 ? Math.round((availableSlots / totalSlots) * 100) : 0
        },
        slotsByDay,
        nextAvailableSlot: doctor.availableSlots.find(slot => slot.isAvailable)
      }
    });

  } catch (error) {
    console.error('Get doctor stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching doctor statistics'
    });
  }
};

module.exports = {
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
};