const router = require('express').Router();
const { verifyToken, requireRole } = require('../../../../shared/middleware/auth');
const { writeAuditLog } = require('../../../../shared/auditLog');
const { pool } = require('../db');

const validStatuses = new Set(['pending', 'approved', 'rejected']);

router.use(verifyToken);
router.use(requireRole('admin'));

router.get('/admin', async (req, res) => {
  try {
    const queryText = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const filters = [];
    const values = [];

    if (queryText) {
      values.push(`%${queryText.toLowerCase()}%`);
      const idx = values.length;
      filters.push(`(
        LOWER(COALESCE(u.full_name, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.email, '')) LIKE $${idx}
        OR LOWER(COALESCE(d.specialty, '')) LIKE $${idx}
      )`);
    }

    if (status && validStatuses.has(status)) {
      values.push(status);
      filters.push(`d.approval_status = $${values.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await pool.query(
      `
        SELECT
          d.id,
          d.user_id,
          COALESCE(u.full_name, CONCAT('Doctor #', d.id::text)) AS full_name,
          u.email,
          d.specialty,
          d.qualification,
          d.consultation_fee,
          d.rating,
          d.available,
          d.approval_status,
          d.verification_notes,
          d.verification_documents,
          d.reviewed_by,
          d.reviewed_at
        FROM doctors d
        LEFT JOIN users u ON u.id = d.user_id
        ${whereClause}
        ORDER BY
          CASE d.approval_status
            WHEN 'pending' THEN 0
            WHEN 'rejected' THEN 1
            ELSE 2
          END,
          d.id DESC
      `,
      values
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('[DoctorService] GET /admin error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/admin/:id/verification', async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const status = typeof req.body.status === 'string' ? req.body.status.trim() : '';
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

    if (!Number.isFinite(doctorId)) {
      return res.status(400).json({ error: 'Invalid doctor id' });
    }

    if (!validStatuses.has(status)) {
      return res.status(400).json({ error: 'Invalid verification status' });
    }

    const result = await pool.query(
      `
        UPDATE doctors
        SET approval_status = $1,
            verification_notes = NULLIF($2, ''),
            available = CASE WHEN $1 = 'approved' THEN TRUE ELSE FALSE END,
            reviewed_by = $3,
            reviewed_at = NOW()
        WHERE id = $4
        RETURNING id, user_id, approval_status, verification_notes, reviewed_by, reviewed_at
      `,
      [status, notes, req.user.id, doctorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    await writeAuditLog(pool, {
      action: 'admin.doctor_verification',
      actorId: req.user.id,
      actorRole: req.user.role,
      ip: req.ip,
      targetId: doctorId,
      detail: { status },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('[DoctorService] PATCH /admin/:id/verification error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/admin/:id/documents', async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const documents = Array.isArray(req.body.documents) ? req.body.documents : null;

    if (!Number.isFinite(doctorId)) {
      return res.status(400).json({ error: 'Invalid doctor id' });
    }

    if (!documents) {
      return res.status(400).json({ error: 'documents must be an array' });
    }

    const result = await pool.query(
      `
        UPDATE doctors
        SET verification_documents = $1::jsonb,
            reviewed_by = $2,
            reviewed_at = NOW()
        WHERE id = $3
        RETURNING id, user_id, verification_documents, reviewed_by, reviewed_at
      `,
      [JSON.stringify(documents), req.user.id, doctorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    await writeAuditLog(pool, {
      action: 'admin.doctor_documents',
      actorId: req.user.id,
      actorRole: req.user.role,
      ip: req.ip,
      targetId: doctorId,
      detail: { document_count: documents.length },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('[DoctorService] PATCH /admin/:id/documents error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
