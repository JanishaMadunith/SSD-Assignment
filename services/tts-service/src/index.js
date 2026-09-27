const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5002;

// Only the configured frontend origin(s) may call this API from a browser.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tts-service' });
});

app.post('/v1/audio/speech', (req, res) => {
  const silentWav = Buffer.from(
    'UklGRhQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
    'base64'
  );

  res.setHeader('Content-Type', 'audio/wav');
  res.send(silentWav);
});

app.listen(PORT, () => {
  console.log(`tts-service running on port ${PORT}`);
});