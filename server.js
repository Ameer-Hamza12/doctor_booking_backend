const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Validate environment variables on startup
const validateEnv = () => {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET', 
    'JWT_REFRESH_SECRET',
    'EMAIL_USER',
    'EMAIL_PASS',
    'FRONTEND_URL'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('💡 Please check your .env file');
    process.exit(1);
  }

  console.log('✅ Environment variables validated');
};

// Call validation
validateEnv();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection with improved error handling
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  
  // Check database status
  mongoose.connection.db.admin().ping((err, result) => {
    if (err) {
      console.error('❌ MongoDB ping failed:', err);
    } else {
      console.log('✅ MongoDB ping successful:', result);
    }
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('💡 Trying to connect to default MongoDB...');
  
  // Try default connection
  mongoose.connect('mongodb://localhost:27017/doctor_booking', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to default MongoDB'))
  .catch(err2 => {
    console.error('❌ Failed to connect to MongoDB:', err2.message);
    console.log('💡 Please ensure MongoDB is running');
  });
});

// ==================== ROUTES ====================

// 1. Health check endpoint (FIRST)
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Doctor Booking API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    database: {
      status: dbStatusMap[dbStatus] || 'unknown',
      readyState: dbStatus
    },
    environment_loaded: {
      JWT_SECRET: process.env.JWT_SECRET ? '✅ Loaded' : '❌ Missing',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ? '✅ Loaded' : '❌ Missing',
      EMAIL_CONFIG: process.env.EMAIL_USER ? '✅ Loaded' : '❌ Missing',
      FRONTEND_URL: process.env.FRONTEND_URL || '❌ Missing'
    }
  });
});

// 2. Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Doctor Booking API',
    version: '1.0.0',
    documentation: 'Check /api/health for system status',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        verifyEmail: 'POST /api/auth/verify-email',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password'
      },
      utility: {
        health: 'GET /api/health',
        testEmail: 'POST /api/test-email'
      }
    }
  });
});

// 3. Test email endpoint (for debugging)
app.post('/api/test-email', async (req, res) => {
  try {
    console.log('📧 Test email request received');
    
    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(400).json({
        success: false,
        error: 'Email credentials not configured',
        help: 'Add EMAIL_USER and EMAIL_PASS to your .env file'
      });
    }

    const nodemailer = require('nodemailer');
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified');
    
    // Send test email
    const info = await transporter.sendMail({
      from: `"Doctor Booking" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: '✅ Test Email - Doctor Booking',
      text: `Test email sent at ${new Date().toLocaleString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px;">
          <h1 style="color: #4CAF50;">✅ Email Test Successful!</h1>
          <p>Your email configuration is working correctly.</p>
          <p><strong>Server Time:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Environment:</strong> ${process.env.NODE_ENV}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            This is a test email from the Doctor Booking API.
          </p>
        </div>
      `
    });
    
    console.log('✅ Test email sent successfully:', info.messageId);
    
    res.json({
      success: true,
      message: 'Test email sent successfully! Check your inbox.',
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    });
    
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      command: error.command,
      suggestion: 'For Gmail, make sure you are using an App Password (not your regular password)'
    });
  }
});

// 4. Apply rate limiting to auth routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 5. Auth routes (with rate limiting)
app.use('/api/auth', limiter, authRoutes);

// 6. Admin routes
app.use('/api/admin', adminRoutes);

// ==================== ERROR HANDLERS ====================
// 404 handler - MUST BE THE LAST ROUTE
app.use('*', (req, res) => {
  console.log(`🔍 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err.stack || err);
  
  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err.details 
    })
  });
});

// Server startup
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`
  ============================================
  🚀 Server running on port ${PORT}
  🌐 http://localhost:${PORT}
  📍 Environment: ${process.env.NODE_ENV}
  ============================================
  
  📍 Available endpoints:
  - GET  /                    - API info
  - GET  /api/health          - Health check (shows JWT config status)  
  - POST /api/test-email      - Test email configuration
  - POST /api/auth/register   - Register user
  - POST /api/auth/login      - Login user
  ============================================
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔻 Received SIGINT. Closing server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  console.log('\n🔻 Received SIGTERM. Closing server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});