const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const healthRoutes = require('./routes/health');
const chatRoutes = require('./routes/chat');
const voiceRoutes = require('./routes/voice');
const recommendationRoutes = require('./routes/recommendations');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
// Only the configured frontend origin(s) may call this API from a browser.
app.use(cors({ origin: env.corsOrigins, credentials: false }));
app.use(express.json({ limit: '2mb' }));

app.use(rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(healthRoutes);
app.use('/api/ai-symptom/chat', chatRoutes);
app.use('/api/ai-symptom/voice', voiceRoutes);
app.use('/api/ai-symptom/recommendations', recommendationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
