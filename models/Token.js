const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  token: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['refresh', 'verification', 'password-reset'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '1d' } // Auto delete after 1 day
  },
  isRevoked: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Create compound index for faster queries
tokenSchema.index({ userId: 1, type: 1 });

const Token = mongoose.model('Token', tokenSchema);

module.exports = Token;