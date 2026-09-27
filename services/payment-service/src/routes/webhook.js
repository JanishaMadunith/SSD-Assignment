const express = require('express');
const { pool } = require('../db');
const { publishEvent } = require('../rabbitmq');
const { stripe } = require('../stripe');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(500).send('Webhook secret not configured');
    }

    if (!signature) {
      return res.status(400).send('Missing Stripe signature');
    }

    const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const appointmentId = parseInt(paymentIntent.metadata?.appointment_id, 10);

      if (!Number.isNaN(appointmentId)) {
        const updateResult = await pool.query(
          `
            UPDATE appointments
            SET payment_status = 'paid'
            WHERE id = $1
              AND payment_status <> 'paid'
            RETURNING id, patient_id, doctor_id, appointment_time, status, payment_status
          `,
          [appointmentId]
        );

        if (updateResult.rows.length > 0) {
          const appointment = updateResult.rows[0];

          await publishEvent('payment.completed', {
            appointment_id: appointment.id,
            patient_id: appointment.patient_id,
            doctor_id: appointment.doctor_id,
            appointment_time: appointment.appointment_time,
            status: appointment.status,
            payment_status: appointment.payment_status,
            stripe_payment_intent_id: paymentIntent.id,
            paid_at: new Date().toISOString(),
          });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[PaymentService] POST /webhook/stripe error:', error);
    return res.status(400).send('Webhook error');
  }
});

module.exports = router;
