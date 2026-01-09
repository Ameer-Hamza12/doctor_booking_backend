const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const createUploadDirs = () => {
  const dirs = [
    'uploads',
    'uploads/doctor-profiles',
    'uploads/doctor-documents',
    'uploads/patient-profiles',
    'uploads/admin-profiles'
  ];

  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
};

createUploadDirs();

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';

    // Determine path based on field name or route
    if (file.fieldname === 'profileImage') {
      if (req.baseUrl.includes('doctor')) {
        uploadPath = 'uploads/doctor-profiles/';
      } else if (req.baseUrl.includes('patient')) {
        uploadPath = 'uploads/patient-profiles/';
      } else if (req.baseUrl.includes('admin')) {
        uploadPath = 'uploads/admin-profiles/';
      } else {
        uploadPath = 'uploads/other/';
      }
    } else if (file.fieldname === 'documents') {
      uploadPath = 'uploads/doctor-documents/';
    }

    cb(null, path.join(__dirname, '..', uploadPath));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'profileImage') {
    // Allow images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
  } else if (file.fieldname === 'documents') {
    // Allow images and PDF
    if (!file.originalname.match(/\.(jpg|jpeg|png|pdf|doc|docx)$/)) {
      return cb(new Error('Only image, PDF, and Word documents are allowed!'), false);
    }
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

module.exports = upload;
