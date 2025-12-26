const User = require('../models/User');
const Token = require('../models/Token');
const {
  generateAccessToken,
  generateRefreshToken,
  generateVerificationToken,
  generatePasswordResetToken,
  verifyToken,
  revokeAllUserTokens
} = require('../utils/generateTokens');
const {
  sendVerificationEmail,
  sendPasswordResetEmail
} = require('../utils/sendEmail');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    console.log('📝 Registration request:', req.body);
    
    const { name, email, password, role, phone, date_of_birth, specialization } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Create user
    const userData = {
      name,
      email,
      password,
      role: role || 'patient',
      phone,
      date_of_birth
    };

    // Add specialization for doctors
    if (role === 'doctor') {
      userData.specialization = specialization;
      userData.isApproved = false; // Doctors need admin approval
    }

    console.log('👤 Creating user with data:', { ...userData, password: '[HIDDEN]' });
    const user = await User.create(userData);
    console.log('✅ User created:', user._id);

    // If doctor, create doctor profile
    if (role === 'doctor') {
      try {
        const Doctor = require('../models/Doctor');
        await Doctor.create({
          userId: user._id,
          licenseNumber: `LIC${Date.now()}`,
          consultationFee: req.body.consultationFee || 100
        });
        console.log('✅ Doctor profile created');
      } catch (doctorError) {
        console.error('❌ Error creating doctor profile:', doctorError);
        // Continue even if doctor profile creation fails
      }
    }

    // Generate verification token and send email
    let verificationSent = false;
    try {
      console.log('📧 Generating verification token...');
      const { verificationToken } = await generateVerificationToken(user._id);
      console.log('📧 Sending verification email...');
      await sendVerificationEmail(user, verificationToken);
      verificationSent = true;
      console.log('✅ Verification email sent');
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError);
      verificationSent = false;
    }

    // Generate tokens
    console.log('🔑 Generating JWT tokens...');
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = await generateRefreshToken(user._id);
    console.log('✅ Tokens generated');

    // Remove sensitive data
    user.password = undefined;

    res.status(201).json({
      success: true,
      message: role === 'doctor' 
        ? 'Registration successful. Please verify your email. Your doctor account is pending admin approval.' 
        : 'Registration successful. Please verify your email.',
      verificationSent,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          phone: user.phone,
          date_of_birth: user.date_of_birth,
          specialization: user.specialization,
          isApproved: user.isApproved
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error('❌ Registration error details:', error);
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error during registration'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if account is blocked
    if (user.isBlocked) {
      return res.status(401).json({
        success: false,
        error: 'Your account has been blocked. Please contact support.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Your account is not active. Please contact support.'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check email verification
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        error: 'Please verify your email address before logging in'
      });
    }

    // For doctors, check if approved
    if (user.role === 'doctor' && !user.isApproved) {
      return res.status(401).json({
        success: false,
        error: 'Your doctor account is pending approval from admin'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = await generateRefreshToken(user._id);

    // Remove sensitive data
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          phone: user.phone,
          date_of_birth: user.date_of_birth,
          ...(user.role === 'doctor' && { 
            specialization: user.specialization,
            isApproved: user.isApproved 
          })
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
};

// @desc    Verify email
// @route   POST /api/auth/verify-email
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification token is required'
      });
    }

    // Verify token
    const tokenDoc = await verifyToken(token, 'verification');
    
    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token'
      });
    }

    // Update user
    const user = await User.findById(tokenDoc.userId);
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email already verified'
      });
    }

    user.isVerified = true;
    await user.save();

    // Revoke the used token
    const { revokeToken } = require('../utils/generateTokens');
    await revokeToken(token);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during email verification'
    });
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email already verified'
      });
    }

    // Revoke old verification tokens
    await revokeAllUserTokens(user._id, 'verification');

    // Generate new verification token
    const { verificationToken } = await generateVerificationToken(user._id);
    await sendVerificationEmail(user, verificationToken);

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    console.error('❌ Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during resending verification'
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return res.status(200).json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    // Revoke old password reset tokens
    await revokeAllUserTokens(user._id, 'password-reset');

    // Generate new password reset token
    const { resetToken } = await generatePasswordResetToken(user._id);
    await sendPasswordResetEmail(user, resetToken);

    res.status(200).json({
      success: true,
      message: 'If your email is registered, you will receive a password reset link'
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during password reset request'
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required'
      });
    }

    // Verify token
    const tokenDoc = await verifyToken(token, 'password-reset');
    
    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired password reset token'
      });
    }

    // Update user password
    const user = await User.findById(tokenDoc.userId);
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    user.password = password;
    await user.save();

    // Revoke the used token
    const { revokeToken } = require('../utils/generateTokens');
    await revokeToken(token);

    // Revoke all refresh tokens for security
    await revokeAllUserTokens(user._id, 'refresh');

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during password reset'
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching profile'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/update-profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { name, phone, date_of_birth } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (date_of_birth) user.date_of_birth = date_of_birth;
    
    await user.save();
    
    user.password = undefined;
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error updating profile'
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }
    
    const user = await User.findById(req.user._id).select('+password');
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Revoke all refresh tokens for security
    await revokeAllUserTokens(user._id, 'refresh');
    
    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error changing password'
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken;
    
    if (refreshToken) {
      // Revoke the specific refresh token
      const { revokeToken } = require('../utils/generateTokens');
      await revokeToken(refreshToken);
    }
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during logout'
    });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  changePassword,
  logout
};