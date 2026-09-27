require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDB } = require('./db');
const profileRouter = require('./routes/profile');
const availabilityRouter = require('./routes/availability');
const appointmentsRouter = require('./routes/appointments');
const prescriptionsRouter = require('./routes/prescriptions');
const adminRouter = require('./routes/admin');

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
    service: 'doctor-service',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/doctors', adminRouter);
app.use('/api/doctors', profileRouter);
app.use('/api/doctors', availabilityRouter);
app.use('/api/doctors', appointmentsRouter);
app.use('/api/doctors', prescriptionsRouter);

app.use((err, req, res, next) => {
  return res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3002;

async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Doctor service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[DoctorService] Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
