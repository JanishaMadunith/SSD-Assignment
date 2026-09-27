const express = require('express');
const { verifyToken, requireRole } = require('../../../../shared/middleware/auth');
const { pool } = require('../db');

const router = express.Router();

router.get('/all', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const patientsResult = await pool.query(
      `
        SELECT id, name, email, phone, blood_type, created_at
        FROM patients
        ORDER BY created_at DESC
      `
    );

    return res.json(patientsResult.rows);
  } catch (error) {
    console.error('[PatientService] GET /all error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', verifyToken, requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const patientResult = await pool.query(
      'SELECT * FROM patients WHERE id = $1',
      [req.params.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];

    if (req.user.role === 'doctor') {
      const relationshipResult = await pool.query(
        `
          SELECT 1
          FROM appointments a
          JOIN doctors d ON d.id = a.doctor_id
          WHERE d.user_id = $1
            AND a.patient_id = $2
          LIMIT 1
        `,
        [req.user.id, patient.user_id]
      );

      if (relationshipResult.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const historyResult = await pool.query(
      'SELECT * FROM medical_history WHERE patient_id = $1',
      [req.params.id]
    );

    return res.json({
      ...patient,
      medical_history: historyResult.rows[0] || null,
    });
  } catch (error) {
    console.error('[PatientService] GET /:id error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
