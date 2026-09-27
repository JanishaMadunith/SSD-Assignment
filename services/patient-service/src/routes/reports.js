const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { verifyToken, requireRole } = require('../../../../shared/middleware/auth');
const { pool } = require('../db');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error('Only PDF, JPG, and PNG files are allowed');
    error.statusCode = 400; // a validation error, safe to show the client
    return cb(error);
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// file_path is deliberately excluded: the on-disk location never reaches the client.
const REPORT_COLUMNS = `
  id, patient_id, title, description, file_name, file_type, file_size, uploaded_at
`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function canReadPatientReports(user, patientUserId) {
  if (user.role === 'admin') {
    return true; // admins are unrestricted by design
  }

  if (user.role === 'patient') {
    return user.id === patientUserId;
  }

  if (user.role === 'doctor') {
    // Treatment relationship: the doctor must share an appointment with the patient.
    const link = await pool.query(
      `
        SELECT 1
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE d.user_id = $1 AND a.patient_id = $2
        LIMIT 1
      `,
      [user.id, patientUserId]
    );
    return link.rows.length > 0;
  }

  return false;
}

router.get('/reports/:id/file', verifyToken, requireRole('patient', 'doctor', 'admin'), async (req, res) => {
  try {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportResult = await pool.query(
      `
        SELECT r.file_name, r.file_path, p.user_id AS patient_user_id
        FROM medical_reports r
        JOIN patients p ON p.id = r.patient_id
        WHERE r.id = $1
      `,
      [req.params.id]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    if (!(await canReadPatientReports(req.user, report.patient_user_id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only serve files that live inside the upload directory.
    const resolvedPath = path.resolve(report.file_path);
    if (!resolvedPath.startsWith(uploadDir + path.sep) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.download(resolvedPath, report.file_name);
  } catch (error) {
    console.error('[PatientService] GET /reports/:id/file error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reports', verifyToken, requireRole('patient'), async (req, res) => {
  try {
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Create your profile first' });
    }

    const patientId = patientResult.rows[0].id;

    const reportsResult = await pool.query(
      `
        SELECT ${REPORT_COLUMNS}
        FROM medical_reports
        WHERE patient_id = $1
        ORDER BY uploaded_at DESC
      `,
      [patientId]
    );

    return res.json(reportsResult.rows);
  } catch (error) {
    console.error('[PatientService] GET /reports error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reports', verifyToken, requireRole('patient'), upload.single('file'), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Create your profile first' });
    }

    const patientId = patientResult.rows[0].id;

    const insertResult = await pool.query(
      `
        INSERT INTO medical_reports (
          patient_id,
          title,
          description,
          file_name,
          file_path,
          file_type,
          file_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${REPORT_COLUMNS}
      `,
      [
        patientId,
        title,
        description || null,
        req.file.originalname,
        req.file.path,
        req.file.mimetype,
        req.file.size,
      ]
    );

    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('[PatientService] POST /reports error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/reports/:id', verifyToken, requireRole('patient'), async (req, res) => {
  try {
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Create your profile first' });
    }

    const patientId = patientResult.rows[0].id;

    const reportResult = await pool.query(
      'SELECT * FROM medical_reports WHERE id = $1 AND patient_id = $2',
      [req.params.id, patientId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    if (report.file_path && fs.existsSync(report.file_path)) {
      fs.unlinkSync(report.file_path);
    }

    await pool.query('DELETE FROM medical_reports WHERE id = $1', [req.params.id]);

    return res.json({ success: true });
  } catch (error) {
    console.error('[PatientService] DELETE /reports/:id error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/reports', verifyToken, requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const reportsResult = await pool.query(
      `
        SELECT ${REPORT_COLUMNS}
        FROM medical_reports
        WHERE patient_id = $1
        ORDER BY uploaded_at DESC
      `,
      [req.params.id]
    );

    return res.json(reportsResult.rows);
  } catch (error) {
    console.error('[PatientService] GET /:id/reports error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
