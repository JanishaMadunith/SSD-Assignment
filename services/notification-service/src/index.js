require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { startConsumer, closeRabbit } = require('./rabbitmq');
const { sendEmail } = require('./notifications');
const { verifyToken, requireRole } = require('../../shared/middleware/auth');

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

// V07 Fix: Require admin authentication for test email endpoint
app.post('/api/notifications/test/email', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { toEmail, subject, body } = req.body;
    if (!toEmail || !subject || !body) {
      return res.status(400).json({ error: 'toEmail, subject, and body are required' });
    }

    await sendEmail(toEmail, subject, body);
    return res.json({ success: true, message: 'Test email processed' });
  } catch (error) {
    console.error('[NotificationService] POST /test/email error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/test/email', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { toEmail, subject, body } = req.body;
    if (!toEmail || !subject || !body) {
      return res.status(400).json({ error: 'toEmail, subject, and body are required' });
    }

    await sendEmail(toEmail, subject, body);
    return res.json({ success: true, message: 'Test email processed' });
  } catch (error) {
    console.error('[NotificationService] POST /test/email error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Deliberate 4xx messages are returned to the client; internal errors never are.
// Without this, Express's default handler sends the stack trace.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  console.error('[NotificationService] Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
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
