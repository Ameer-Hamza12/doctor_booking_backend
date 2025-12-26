const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Token = require('../models/Token');

// Validate JWT secrets on startup
const validateSecrets = () => {
  if (!process.env.JWT_SECRET) {
    console.error('❌ ERROR: JWT_SECRET is not defined in .env file');
    process.exit(1);
  }
  
  if (!process.env.JWT_REFRESH_SECRET) {
    console.error('❌ ERROR: JWT_REFRESH_SECRET is not defined in .env file');
    process.exit(1);
  }
  
  console.log('✅ JWT secrets validated successfully');
};

// Call validation on module load
validateSecrets();

const generateAccessToken = (userId, role) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
};

const generateRefreshToken = async (userId) => {
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is not configured');
  }

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );

  // Save refresh token to database
  await Token.create({
    userId,
    token: refreshToken,
    type: 'refresh',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  return refreshToken;
};

const generateVerificationToken = async (userId) => {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  await Token.create({
    userId,
    token: verificationToken,
    type: 'verification',
    expiresAt
  });

  return { verificationToken, expiresAt };
};

const generatePasswordResetToken = async (userId) => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  
  await Token.create({
    userId,
    token: resetToken,
    type: 'password-reset',
    expiresAt
  });

  return { resetToken, expiresAt };
};

const verifyToken = async (token, type) => {
  const tokenDoc = await Token.findOne({
    token,
    type,
    isRevoked: false,
    expiresAt: { $gt: new Date() }
  });

  return tokenDoc;
};

const revokeToken = async (token) => {
  await Token.findOneAndUpdate(
    { token },
    { isRevoked: true }
  );
};

const revokeAllUserTokens = async (userId, type) => {
  await Token.updateMany(
    { userId, type, isRevoked: false },
    { isRevoked: true }
  );
};

// JWT verification functions
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateVerificationToken,
  generatePasswordResetToken,
  verifyToken,
  revokeToken,
  revokeAllUserTokens,
  verifyAccessToken,
  verifyRefreshToken
};