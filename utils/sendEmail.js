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
      <p>Thank you for registering with Us. Please verify your email address by clicking the button below:</p>
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

// Add these functions to the existing sendEmail.js file

/**
 * Send appointment confirmation email to doctor
 */
const sendAppointmentConfirmationToDoctor = async (doctorEmail, doctorName, appointmentDetails) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #10b981; text-align: center;">New Appointment Confirmed!</h2>
      <p>Hello Dr. ${doctorName},</p>
      <p>A new appointment has been confirmed with the following details:</p>
      
      <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p><strong>Patient Name:</strong> ${appointmentDetails.patientName}</p>
        <p><strong>Appointment Date:</strong> ${appointmentDetails.date}</p>
        <p><strong>Time Slot:</strong> ${appointmentDetails.timeSlot}</p>
        <p><strong>Consultation Type:</strong> ${appointmentDetails.consultationType}</p>
        <p><strong>Patient Notes:</strong> ${appointmentDetails.notes || 'No notes provided'}</p>
        <p><strong>Appointment ID:</strong> ${appointmentDetails.appointmentId}</p>
      </div>
      
      <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p><strong>💡 Reminder:</strong></p>
        <ul style="margin: 10px 0;">
          <li>Review patient details before the appointment</li>
          <li>Prepare necessary medical records</li>
          <li>Join the video call 5 minutes early for online consultations</li>
        </ul>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/doctor/appointments" 
           style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          View Appointment in Dashboard
        </a>
      </div>
      
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        Need to reschedule? Please contact the patient directly or use the appointment management system.
      </p>
    </div>
  `;

  return sendEmail({
    email: doctorEmail,
    subject: `New Appointment Confirmed - ${appointmentDetails.patientName}`,
    html: html
  });
};

/**
 * Send appointment status update to patient
 */
const sendAppointmentStatusUpdateToPatient = async (patientEmail, patientName, doctorName, appointmentDetails) => {
  const statusColors = {
    confirmed: '#10b981',
    cancelled: '#dc2626',
    rescheduled: '#f59e0b',
    completed: '#3b82f6'
  };

  const statusMessages = {
    confirmed: 'Your appointment has been confirmed by the doctor.',
    cancelled: 'Your appointment has been cancelled by the doctor.',
    rescheduled: 'Your appointment has been rescheduled.',
    completed: 'Your appointment has been completed.'
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: ${statusColors[appointmentDetails.status] || '#2563eb'}; text-align: center;">
        Appointment ${appointmentDetails.status.charAt(0).toUpperCase() + appointmentDetails.status.slice(1)}
      </h2>
      <p>Hello ${patientName},</p>
      <p>${statusMessages[appointmentDetails.status] || 'Your appointment status has been updated.'}</p>
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p><strong>Doctor:</strong> Dr. ${doctorName}</p>
        <p><strong>Appointment Date:</strong> ${appointmentDetails.date}</p>
        <p><strong>Time Slot:</strong> ${appointmentDetails.timeSlot}</p>
        <p><strong>Status:</strong> ${appointmentDetails.status}</p>
        ${appointmentDetails.newDate ? `<p><strong>New Date:</strong> ${appointmentDetails.newDate}</p>` : ''}
        ${appointmentDetails.notes ? `<p><strong>Doctor's Notes:</strong> ${appointmentDetails.notes}</p>` : ''}
      </div>
      
      ${appointmentDetails.status === 'confirmed' ? `
        <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p><strong>📋 Preparation Checklist:</strong></p>
          <ul style="margin: 10px 0;">
            <li>Have your medical history ready</li>
            <li>List any medications you're taking</li>
            <li>Prepare questions for the doctor</li>
            <li>Test your video/audio equipment (for online consultations)</li>
            <li>Join 10 minutes before the scheduled time</li>
          </ul>
        </div>
      ` : ''}
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/patient/appointments" 
           style="background-color: ${statusColors[appointmentDetails.status] || '#2563eb'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          View Appointment Details
        </a>
      </div>
      
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        For any questions or concerns, please contact the doctor's office directly.
      </p>
    </div>
  `;

  return sendEmail({
    email: patientEmail,
    subject: `Appointment ${appointmentDetails.status.charAt(0).toUpperCase() + appointmentDetails.status.slice(1)} - Dr. ${doctorName}`,
    html: html
  });
};

/**
 * Send appointment reminder email
 */
const sendAppointmentReminder = async (email, name, appointmentDetails, hoursBefore = 24) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #f59e0b; text-align: center;">Appointment Reminder</h2>
      <p>Hello ${name},</p>
      <p>This is a reminder for your upcoming appointment in ${hoursBefore} hours:</p>
      
      <div style="background-color: #fffbeb; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p><strong>Doctor:</strong> Dr. ${appointmentDetails.doctorName}</p>
        <p><strong>Specialization:</strong> ${appointmentDetails.specialization}</p>
        <p><strong>Date:</strong> ${appointmentDetails.date}</p>
        <p><strong>Time:</strong> ${appointmentDetails.time}</p>
        <p><strong>Consultation Type:</strong> ${appointmentDetails.consultationType}</p>
        <p><strong>Appointment ID:</strong> ${appointmentDetails.appointmentId}</p>
      </div>
      
      ${appointmentDetails.consultationType === 'online' ? `
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p><strong>💻 For Online Consultation:</strong></p>
          <ul style="margin: 10px 0;">
            <li>Join using this link: <a href="${appointmentDetails.meetingLink}">Meeting Link</a></li>
            <li>Meeting ID: ${appointmentDetails.meetingId}</li>
            <li>Password: ${appointmentDetails.meetingPassword || 'Not required'}</li>
            <li>Test your camera and microphone beforehand</li>
            <li>Ensure stable internet connection</li>
          </ul>
        </div>
      ` : `
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p><strong>🏥 For In-Person Consultation:</strong></p>
          <ul style="margin: 10px 0;">
            <li>Address: ${appointmentDetails.clinicAddress}</li>
            <li>Arrive 15 minutes early for registration</li>
            <li>Bring your ID and insurance card</li>
            <li>Carry any relevant medical reports</li>
          </ul>
        </div>
      `}
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/appointments" 
           style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          View Appointment
        </a>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/reschedule" 
           style="background-color: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-left: 10px;">
          Reschedule
        </a>
      </div>
      
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        If you need to cancel, please do so at least 2 hours in advance to avoid cancellation fees.
      </p>
    </div>
  `;

  return sendEmail({
    email: email,
    subject: `Reminder: Appointment with Dr. ${appointmentDetails.doctorName} in ${hoursBefore} hours`,
    html: html
  });
};


module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTestEmail,
  sendAppointmentConfirmationToDoctor,
  sendAppointmentStatusUpdateToPatient,
  sendAppointmentReminder
};