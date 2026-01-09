const User = require('../models/User');
const Doctor = require('../models/Doctor');

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalDoctors,
      totalPatients,
      pendingDoctors,
      activeDoctors,
      blockedDoctors
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'doctor' }),
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({
        role: 'doctor',
        isApproved: false,
        isBlocked: false,
        isVerified: true
      }),
      User.countDocuments({
        role: 'doctor',
        isApproved: true,
        isBlocked: false
      }),
      User.countDocuments({
        role: 'doctor',
        isBlocked: true
      })
    ]);

    // Recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRegistrations = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalDoctors,
        totalPatients,
        pendingDoctors,
        activeDoctors,
        blockedDoctors,
        recentRegistrations
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching dashboard stats'
    });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', role = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = search ? {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ]
    } : {};

    // Add role filter if specified
    if (role && ['patient', 'doctor', 'admin'].includes(role)) {
      searchQuery.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(searchQuery)
        .select('-password -verificationToken -verificationTokenExpire -passwordResetToken -passwordResetExpire')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(searchQuery)
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching users'
    });
  }
};

// @desc    Get all doctors
// @route   GET /api/admin/doctors
// @access  Private/Admin
const getDoctors = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build base query for doctors
    let searchQuery = { role: 'doctor' };

    // Add search criteria
    if (search) {
      searchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { specialization: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter
    if (status === 'pending') {
      searchQuery.isApproved = false;
      searchQuery.isBlocked = false;
    } else if (status === 'approved') {
      searchQuery.isApproved = true;
      searchQuery.isBlocked = false;
    } else if (status === 'blocked') {
      searchQuery.isBlocked = true;
    }

    const [doctors, total] = await Promise.all([
      User.find(searchQuery)
        .select('-password -verificationToken -verificationTokenExpire -passwordResetToken -passwordResetExpire')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(searchQuery)
    ]);

    // Get doctor details from Doctor collection
    const doctorsWithDetails = await Promise.all(
      doctors.map(async (doctor) => {
        const doctorDetails = await Doctor.findOne({ userId: doctor._id })
          .select('qualifications experience licenseNumber hospital consultationFee availableSlots ratings');

        return {
          ...doctor.toObject(),
          doctorDetails: doctorDetails || null
        };
      })
    );

    res.status(200).json({
      success: true,
      count: doctorsWithDetails.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: doctorsWithDetails
    });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching doctors'
    });
  }
};

// @desc    Approve doctor
// @route   PUT /api/admin/doctors/:id/approve
// @access  Private/Admin
const approveDoctor = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.role !== 'doctor') {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found'
      });
    }

    // Check if already approved
    if (user.isApproved) {
      return res.status(400).json({
        success: false,
        error: 'Doctor is already approved'
      });
    }

    // Update User model with approval
    user.isApproved = true;
    user.isBlocked = false;
    user.approvedBy = req.user._id;
    user.approvedAt = Date.now();

    await user.save();

    // Also update Doctor model if needed
    await Doctor.findOneAndUpdate(
      { userId: user._id },
      {
        approvedBy: req.user._id,
        approvedAt: Date.now()
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Doctor approved successfully',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isApproved: user.isApproved,
        isBlocked: user.isBlocked,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt
      }
    });
  } catch (error) {
    console.error('Approve doctor error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while approving doctor'
    });
  }
};

// @desc    Block doctor
// @route   PUT /api/admin/doctors/:id/block
// @access  Private/Admin
const blockDoctor = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.role !== 'doctor') {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found'
      });
    }

    // Check if already blocked
    if (user.isBlocked) {
      return res.status(400).json({
        success: false,
        error: 'Doctor is already blocked'
      });
    }

    user.isBlocked = true;
    user.isApproved = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Doctor blocked successfully',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isApproved: user.isApproved,
        isBlocked: user.isBlocked
      }
    });
  } catch (error) {
    console.error('Block doctor error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while blocking doctor'
    });
  }
};

// @desc    Unblock doctor
// @route   PUT /api/admin/doctors/:id/unblock
// @access  Private/Admin
const unblockDoctor = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.role !== 'doctor') {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found'
      });
    }

    // Check if not blocked
    if (!user.isBlocked) {
      return res.status(400).json({
        success: false,
        error: 'Doctor is not blocked'
      });
    }

    user.isBlocked = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Doctor unblocked successfully',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isApproved: user.isApproved,
        isBlocked: user.isBlocked
      }
    });
  } catch (error) {
    console.error('Unblock doctor error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while unblocking doctor'
    });
  }
};

// @desc    Toggle user active status
// @route   PUT /api/admin/users/:id/toggle-active
// @access  Private/Admin
const toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent deactivating yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot deactivate your own account'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle user active error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while toggling user status'
    });
  }
};

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -verificationToken -verificationTokenExpire -passwordResetToken -passwordResetExpire')
      .populate('approvedBy', 'name email');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // If user is doctor, get doctor details
    let doctorDetails = null;
    if (user.role === 'doctor') {
      doctorDetails = await Doctor.findOne({ userId: user._id });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        doctorDetails
      }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching user'
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Don't allow deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    // If user is doctor, delete doctor profile too
    if (user.role === 'doctor') {
      await Doctor.findOneAndDelete({ userId: user._id });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting user'
    });
  }
};

// @desc    Update admin profile image
// @route   POST /api/admin/profile/image
// @access  Private/Admin
const updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

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
    user.profileImage = `uploads/admin-profiles/${req.file.filename}`;
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
};