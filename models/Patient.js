const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  age: {
    type: Number,
    min: 0,
    max: 120
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  medicalHistory: [{
    condition: String,
    diagnosedDate: Date,
    status: String
  }],
  allergies: [String],
  medications: [{
    name: String,
    dosage: String,
    frequency: String
  }],
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

patientSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Patient = mongoose.model('Patient', patientSchema);
module.exports = Patient;