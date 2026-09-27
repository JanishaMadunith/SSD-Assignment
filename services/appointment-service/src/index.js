require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDB } = require('./db');
const { connectRabbit, closeRabbit } = require('./rabbitmq');
const appointmentsRouter = require('./routes/appointments');

const app = express();

// Only the configured frontend origin(s) may call this API from a browser.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: false }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'appointment-service',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/appointments', appointmentsRouter);

app.use((err, req, res, next) => {
  console.error('[AppointmentService] Unhandled error:', err);
  return res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3003;

async function startServer() {
  try {
    await initDB();
    await connectRabbit();

    app.listen(PORT, () => {
      console.log(`Appointment service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[AppointmentService] Startup failed:', error);
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
