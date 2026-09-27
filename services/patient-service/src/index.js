require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDB } = require('./db');
const profileRouter = require('./routes/profile');
const historyRouter = require('./routes/history');
const reportsRouter = require('./routes/reports');
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
// Uploaded reports are not web-served; they are streamed only through the
// authenticated, ownership-checked GET /api/patients/reports/:id/file route.

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'patient-service',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/patients', profileRouter);
app.use('/api/patients', historyRouter);
app.use('/api/patients', reportsRouter);
app.use('/api/patients', prescriptionsRouter);
app.use('/api/patients', adminRouter);

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large, max 10MB' });
  }

  return res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3002;

async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Patient service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[PatientService] Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
