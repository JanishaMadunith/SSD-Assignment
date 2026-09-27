const express = require('express');
const { verifyToken, requireRole } = require('../../../../shared/middleware/auth');
const { pool } = require('../db');
const { publishEvent } = require('../rabbitmq');

const router = express.Router();

const APPOINTMENT_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled']);
const PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed']);

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

async function getDoctorById(doctorId) {
  const result = await pool.query(
    `
      SELECT d.id, d.user_id, u.full_name, d.specialty, d.qualification, d.consultation_fee, d.rating, u.email
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = $1
    `,
    [doctorId]
  );

  return result.rows[0] || null;
}

async function getDoctorByUserId(userId) {
  const result = await pool.query(
    `
      SELECT d.id, d.user_id, u.full_name, d.specialty, d.qualification, d.consultation_fee, d.rating, u.email
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      WHERE d.user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getPatientByUserId(userId) {
  const result = await pool.query(
    `
      SELECT p.id, p.user_id, p.name, p.email
      FROM patients p
      WHERE p.user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

function getDayOfWeek(dateObj) {
  return dateObj.getDay();
}

function getTimePart(dateObj) {
  return dateObj.toTimeString().slice(0, 8);
}

async function isWithinAvailability(doctorId, appointmentDate) {
  const dayOfWeek = getDayOfWeek(appointmentDate);
  const appointmentTime = getTimePart(appointmentDate);

  const result = await pool.query(
    `
      SELECT id
      FROM availability
      WHERE doctor_id = $1
        AND day_of_week = $2
        AND is_available = TRUE
        AND start_time <= $3::time
        AND end_time > $3::time
      LIMIT 1
    `,
    [doctorId, dayOfWeek, appointmentTime]
  );

  return result.rows.length > 0;
}

function canAccessAppointment(appointment, user) {
  if (user.role === 'doctor') {
    return appointment.doctor_user_id === user.id;
  }

  if (user.role === 'patient') {
    return appointment.patient_id === user.id;
  }

  return false;
}

router.get('/doctors', async (req, res) => {
  try {
    const { specialty, available } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const filters = [];
    const values = [];

    if (typeof available === 'string') {
      if (available === 'true' || available === 'false') {
        values.push(available === 'true');
        filters.push(`d.available = $${values.length}`);
      }
    }

    if (specialty) {
      values.push(`%${specialty}%`);
      filters.push(`d.specialty ILIKE $${values.length}`);
    }

    values.push(limit, offset);

    const query = `
      SELECT d.id, d.user_id, u.full_name, d.specialty, d.qualification, d.consultation_fee, d.rating, d.available
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY d.rating DESC, d.id DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `;

    const result = await pool.query(query, values);

    return res.json({ page, limit, doctors: result.rows });
  } catch (error) {
    console.error('[AppointmentService] GET /doctors error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/doctors/:doctorId/availability', async (req, res) => {
  try {
    const doctorId = parseInt(req.params.doctorId, 10);
    if (Number.isNaN(doctorId)) {
      return res.status(400).json({ error: 'Invalid doctorId' });
    }

    const doctor = await getDoctorById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const result = await pool.query(
      `
        SELECT id, doctor_id, day_of_week, start_time, end_time, is_available
        FROM availability
        WHERE doctor_id = $1
          AND is_available = TRUE
        ORDER BY day_of_week, start_time
      `,
      [doctorId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('[AppointmentService] GET /doctors/:doctorId/availability error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/doctors/:doctorId', async (req, res) => {
  try {
    const doctorId = parseInt(req.params.doctorId, 10);
    if (Number.isNaN(doctorId)) {
      return res.status(400).json({ error: 'Invalid doctorId' });
    }

    const doctor = await getDoctorById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    return res.json(doctor);
  } catch (error) {
    console.error('[AppointmentService] GET /doctors/:doctorId error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', verifyToken, requireRole('patient'), async (req, res) => {
  try {
    const { doctor_id, appointment_time } = req.body;
    const doctorId = parseInt(doctor_id, 10);

    if (Number.isNaN(doctorId) || !appointment_time) {
      return res.status(400).json({ error: 'doctor_id and appointment_time are required' });
    }

    const appointmentDate = new Date(appointment_time);
    if (Number.isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ error: 'Invalid appointment_time format' });
    }

    if (appointmentDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Appointment time must be in the future' });
    }

    const doctor = await getDoctorById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const patient = await getPatientByUserId(req.user.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const inAvailability = await isWithinAvailability(doctorId, appointmentDate);
    if (!inAvailability) {
      return res.status(400).json({ error: 'Selected time is outside doctor availability' });
    }

    const existing = await pool.query(
      `
        SELECT id
        FROM appointments
        WHERE doctor_id = $1
          AND appointment_time = $2
          AND status <> 'cancelled'
        LIMIT 1
      `,
      [doctorId, appointmentDate.toISOString()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Time slot already booked' });
    }

    const result = await pool.query(
      `
        INSERT INTO appointments (
          patient_id,
          doctor_id,
          appointment_time,
          status,
          payment_status
        )
        VALUES ($1, $2, $3, 'pending', 'pending')
        RETURNING *
      `,
      [req.user.id, doctorId, appointmentDate.toISOString()]
    );

    const appointment = result.rows[0];

    await publishEvent('appointment.created', {
      appointment_id: appointment.id,
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      appointment_time: appointment.appointment_time,
      status: appointment.status,
      patient_email: patient.email || req.user.email,
      doctor_email: doctor.email,
    });

    return res.status(201).json(appointment);
  } catch (error) {
    console.error('[AppointmentService] POST / error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/patient', verifyToken, requireRole('patient'), async (req, res) => {
  try {
    const { status } = req.query;

    if (status && !APPOINTMENT_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const values = [req.user.id];
    let whereClause = 'a.patient_id = $1';

    if (status) {
      values.push(status);
      whereClause += ` AND a.status = $${values.length}`;
    }

    const result = await pool.query(
      `
        SELECT a.*, d.user_id AS doctor_user_id, u.full_name AS doctor_name, u.email AS doctor_email,
               d.specialty, d.qualification, d.consultation_fee
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users u ON u.id = d.user_id
        WHERE ${whereClause}
        ORDER BY a.appointment_time DESC, a.created_at DESC
      `,
      values
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('[AppointmentService] GET /patient error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/doctor', verifyToken, requireRole('doctor'), async (req, res) => {
  try {
    const { status } = req.query;

    if (status && !APPOINTMENT_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }

    const values = [doctor.id];
    let whereClause = 'a.doctor_id = $1';

    if (status) {
      values.push(status);
      whereClause += ` AND a.status = $${values.length}`;
    }

    const result = await pool.query(
      `
        SELECT a.*, p.name AS patient_name, p.email AS patient_email, p.phone AS patient_phone
        FROM appointments a
        LEFT JOIN patients p ON p.user_id = a.patient_id
        WHERE ${whereClause}
        ORDER BY a.appointment_time DESC, a.created_at DESC
      `,
      values
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('[AppointmentService] GET /doctor error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', verifyToken, requireRole('patient', 'doctor'), async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    if (Number.isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid appointment id' });
    }

    const result = await pool.query(
      `
        SELECT a.*,
               d.user_id AS doctor_user_id,
               du.full_name AS doctor_name,
               du.email AS doctor_email,
               p.name AS patient_name,
               p.email AS patient_email,
               p.user_id AS patient_user_id
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users du ON du.id = d.user_id
        LEFT JOIN patients p ON p.user_id = a.patient_id
        WHERE a.id = $1
      `,
      [appointmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appointment = result.rows[0];
    if (!canAccessAppointment(appointment, req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json(appointment);
  } catch (error) {
    console.error('[AppointmentService] GET /:id error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/confirm', verifyToken, requireRole('doctor'), async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    if (Number.isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid appointment id' });
    }

    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }

    const result = await pool.query(
      `
        UPDATE appointments
        SET status = 'confirmed'
        WHERE id = $1
          AND doctor_id = $2
          AND status = 'pending'
        RETURNING *
      `,
      [appointmentId, doctor.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending appointment not found' });
    }

    await publishEvent('appointment.confirmed', {
      appointment_id: result.rows[0].id,
      patient_id: result.rows[0].patient_id,
      doctor_id: result.rows[0].doctor_id,
      appointment_time: result.rows[0].appointment_time,
      status: result.rows[0].status,
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('[AppointmentService] PUT /:id/confirm error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/cancel', verifyToken, requireRole('patient', 'doctor'), async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    if (Number.isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid appointment id' });
    }

    const baseResult = await pool.query(
      `
        SELECT a.*, d.user_id AS doctor_user_id
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE a.id = $1
      `,
      [appointmentId]
    );

    if (baseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appointment = baseResult.rows[0];
    if (!canAccessAppointment(appointment, req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      `
        UPDATE appointments
        SET status = 'cancelled'
        WHERE id = $1
          AND status <> 'cancelled'
        RETURNING *
      `,
      [appointmentId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Appointment already cancelled' });
    }

    await publishEvent('appointment.cancelled', {
      appointment_id: result.rows[0].id,
      patient_id: result.rows[0].patient_id,
      doctor_id: result.rows[0].doctor_id,
      appointment_time: result.rows[0].appointment_time,
      status: result.rows[0].status,
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('[AppointmentService] PUT /:id/cancel error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/complete', verifyToken, requireRole('doctor'), async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    if (Number.isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid appointment id' });
    }

    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }

    const result = await pool.query(
      `
        UPDATE appointments
        SET status = 'completed'
        WHERE id = $1
          AND doctor_id = $2
          AND status IN ('confirmed', 'pending')
        RETURNING *
      `,
      [appointmentId, doctor.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found or cannot be completed' });
    }

    await publishEvent('appointment.completed', {
      appointment_id: result.rows[0].id,
      patient_id: result.rows[0].patient_id,
      doctor_id: result.rows[0].doctor_id,
      appointment_time: result.rows[0].appointment_time,
      status: result.rows[0].status,
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('[AppointmentService] PUT /:id/complete error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/webhook/payment', async (req, res) => {
  try {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const providedSecret = req.headers['x-webhook-secret'];
    if (!providedSecret || providedSecret !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    const { appointment_id, payment_status } = req.body;
    const appointmentId = parseInt(appointment_id, 10);

    if (Number.isNaN(appointmentId) || !PAYMENT_STATUSES.has(payment_status)) {
      return res.status(400).json({ error: 'appointment_id and valid payment_status are required' });
    }

    const result = await pool.query(
      `
        UPDATE appointments
        SET
          payment_status = $1::varchar,
          status = CASE
                     WHEN $1::varchar = 'paid' AND status = 'pending' THEN 'confirmed'
                     ELSE status
                   END
        WHERE id = $2
        RETURNING *
      `,
      [payment_status, appointmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (payment_status === 'paid' && result.rows[0].status === 'confirmed') {
      await publishEvent('appointment.confirmed', {
        appointment_id: result.rows[0].id,
        patient_id: result.rows[0].patient_id,
        doctor_id: result.rows[0].doctor_id,
        appointment_time: result.rows[0].appointment_time,
        status: result.rows[0].status,
      });
    }

    return res.json({ success: true, appointment: result.rows[0] });
  } catch (error) {
    console.error('[AppointmentService] POST /webhook/payment error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
