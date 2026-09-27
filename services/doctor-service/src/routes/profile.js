const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { verifyToken, requireRole } = require('../../../../shared/middleware/auth');
const { pool } = require('../db');

const router = require('express').Router();

const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png'];

const doctorUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedTypes.includes(file.mimetype) || !allowedExts.includes(ext)) {
      const error = new Error('Only PDF, JPG, and PNG files are allowed');
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Apply auth middleware to all routes
router.use(verifyToken);
router.use(requireRole('doctor'));

// Get doctor profile
router.get('/profile', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM doctors
       WHERE user_id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[DoctorService] GET /profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or update doctor profile
router.put('/profile', async (req, res) => {
  try {
    const {
      specialty,
      qualification,
      consultation_fee,
      phone,
      experience,
      license_number,
      bio,
    } = req.body;
    
    // Check if profile exists
    const result = await pool.query(
      `
        INSERT INTO doctors (
          user_id,
          specialty,
          qualification,
          consultation_fee,
          phone,
          experience,
          license_number,
          bio,
          available,
          approval_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 'pending')
        ON CONFLICT (user_id)
        DO UPDATE SET
          specialty = COALESCE(EXCLUDED.specialty, doctors.specialty),
          qualification = COALESCE(EXCLUDED.qualification, doctors.qualification),
          consultation_fee = COALESCE(EXCLUDED.consultation_fee, doctors.consultation_fee),
          phone = COALESCE(EXCLUDED.phone, doctors.phone),
          experience = COALESCE(EXCLUDED.experience, doctors.experience),
          license_number = COALESCE(EXCLUDED.license_number, doctors.license_number),
          bio = COALESCE(EXCLUDED.bio, doctors.bio)
        RETURNING *
      `,
      [
        req.user.id,
        specialty || null,
        qualification || null,
        consultation_fee || null,
        phone || null,
        experience || null,
        license_number || null,
        bio || null,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[DoctorService] PUT /profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
