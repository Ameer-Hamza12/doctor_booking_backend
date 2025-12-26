const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authorized, no token provided' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check for both 'userId' and 'id' (some JWTs use 'id')
    const userId = decoded.userId || decoded.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format' 
      });
    }

    // Get user from database
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // For doctor approval flow, we should NOT require email verification for admin access
    // But require it for doctor functionality
    if (req.path.includes('/admin/')) {
      // For admin routes, only check account status
      if (!user.isActive || user.isBlocked) {
        return res.status(401).json({ 
          success: false, 
          error: 'Account is not active. Please contact support.' 
        });
      }
    } else {
      // For regular routes, check all conditions
      if (!user.isActive || user.isBlocked) {
        return res.status(401).json({ 
          success: false, 
          error: 'Account is not active. Please contact support.' 
        });
      }
      
      if (!user.isVerified) {
        return res.status(401).json({ 
          success: false, 
          error: 'Please verify your email address' 
        });
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
};


const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refresh token is required' 
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if refresh token exists in database and is not revoked
    const tokenDoc = await require('../models/Token').findOne({
      userId: decoded.userId,
      token: refreshToken,
      type: 'refresh',
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    });

    if (!tokenDoc) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired refresh token' 
      });
    }

    // Get user
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive || user.isBlocked) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found or account is inactive' 
      });
    }

    // Generate new access token
    const accessToken = require('../utils/generateTokens').generateAccessToken(
      user._id,
      user.role
    );

    return res.status(200).json({
      success: true,
      accessToken,
      refreshToken // Return the same refresh token (or generate new one if implementing rotation)
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid refresh token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Refresh token expired' 
      });
    }

    console.error('Refresh token error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
};

module.exports = { protect, refreshToken };