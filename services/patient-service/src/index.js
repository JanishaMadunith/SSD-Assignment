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

// Deliberate 4xx messages are returned to the client; internal errors never are.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large, max 10MB' });
  }

  if (err.statusCode === 400) {
    return res.status(400).json({ error: err.message });
  }

  console.error('[PatientService] Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
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
