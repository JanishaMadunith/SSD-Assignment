require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { startConsumer, closeRabbit } = require('./rabbitmq');

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
    service: 'notification-service',
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3006;

async function startServer() {
  try {
    await startConsumer();
    app.listen(PORT, () => {
      console.log(`Notification service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[NotificationService] Startup failed:', error);
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
