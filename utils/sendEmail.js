// utils/sendEmail.js
const nodemailer = require('nodemailer');

const createTransporter = () => {
  console.log('Creating transporter with:', {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS ? '***' + process.env.EMAIL_PASS.slice(-4) : 'NOT SET'
  });

  // For Gmail, you can use simpler configuration
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  
  // Alternative configuration:
  /*
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false // For self-signed certificates
    }
  });
  */
};

const sendEmail = async (options) => {
  try {
    console.log('Attempting to send email to:', options.email);
    
    const transporter = createTransporter();
    
    // Verify connection configuration
    await transporter.verify();
    console.log('SMTP connection verified successfully');
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"Doctor Booking" <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.html,
      text: options.text || options.subject // Fallback text
    };

    console.log('Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully:', {
      messageId: info.messageId,
      response: info.response
    });
    
    return info;
  } catch (error) {
    console.error('❌ Email sending failed:', {
      error: error.message,
      code: error.code,
      command: error.command
    });
    
    // More detailed error logging
    if (error.code === 'EAUTH') {
      console.error('Authentication failed. Check your email credentials.');
      console.error('Make sure:');
      console.error('1. 2-Step Verification is enabled');
      console.error('2. App Password is generated correctly');
      console.error('3. Email and password are correct');
    } else if (error.code === 'EENVELOPE') {
      console.error('Envelope error. Check recipient email address.');
    } else if (error.code === 'ECONNECTION') {
      console.error('Connection error. Check network or SMTP settings.');
    }
    
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Test email function
const sendTestEmail = async () => {
  try {
    console.log('📧 Testing email configuration...');
    
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">Test Email from Doctor Booking</h2>
        <p>This is a test email sent from your local development server.</p>
        <p>If you receive this, email configuration is working correctly!</p>
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
      </div>
    `;
    
    await sendEmail({
      email: process.env.EMAIL_USER, // Send to yourself for testing
      subject: 'Test Email - Doctor Booking Local Development',
      html: html,
      text: 'Test Email from Doctor Booking Local Development'
    });
    
    console.log('🎉 Test email sent successfully!');
    return true;
  } catch (error) {
    console.error('❌ Test email failed:', error.message);
    return false;
  }
};

// Simple email functions
const sendVerificationEmail = async (user, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #2563eb; text-align: center;">Verify Your Email</h2>
      <p>Hello ${user.name},</p>
      <p>Thank you for registering with Doctor Booking. Please verify your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" 
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        Or copy and paste this link in your browser:<br>
        <code style="background-color: #f3f4f6; padding: 5px 10px; border-radius: 4px; display: inline-block; margin-top: 5px;">
          ${verificationUrl}
        </code>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        This email was sent from Doctor Booking Application. If you didn't create an account, please ignore this email.
      </p>
    </div>
  `;

  return sendEmail({
    email: user.email,
    subject: 'Verify Your Email - Doctor Booking',
    html: html,
    text: `Verify your email by visiting: ${verificationUrl}`
  });
};

const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #dc2626; text-align: center;">Reset Your Password</h2>
      <p>Hello ${user.name},</p>
      <p>We received a request to reset your password. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" 
           style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        Or copy and paste this link in your browser:<br>
        <code style="background-color: #f3f4f6; padding: 5px 10px; border-radius: 4px; display: inline-block; margin-top: 5px;">
          ${resetUrl}
        </code>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
      </p>
    </div>
  `;

  return sendEmail({
    email: user.email,
    subject: 'Password Reset Request - Doctor Booking',
    html: html,
    text: `Reset your password by visiting: ${resetUrl}`
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTestEmail
};