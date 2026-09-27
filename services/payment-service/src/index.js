require('dotenv').config();

const cors = require('cors');
const express = require('express');
const { initDB } = require('./db');
const { connectRabbit, closeRabbit } = require('./rabbitmq');
const paymentsRouter = require('./routes/payments');
const webhookRouter = require('./routes/webhook');

const app = express();

// Only the configured frontend origin(s) may call this API from a browser.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: false }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'payment-service',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }), webhookRouter);

app.use(express.json());
app.use('/api/payments', paymentsRouter);

app.use((err, req, res, next) => {
  console.error('[PaymentService] Unhandled error:', err);
  return res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3005;

async function startServer() {
  try {
    await initDB();
    await connectRabbit();

    app.listen(PORT, () => {
      console.log(`Payment service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[PaymentService] Startup failed:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  await closeRabbit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeRabbit();
  process.exit(0);
});

startServer();
