require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDB } = require('./db');
const telemedicineRouter = require('./routes/telemedicine');

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
    service: 'telemedicine-service',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/telemedicine', telemedicineRouter);

app.use((err, req, res, next) => {
  console.error('[TelemedicineService] Unhandled error:', err);
  return res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3004;

async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Telemedicine service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[TelemedicineService] Startup failed:', error);
    process.exit(1);
  }
}

startServer();
