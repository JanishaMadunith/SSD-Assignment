require('dotenv').config();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3007),
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_here',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
  rateLimitMaxRequests: toNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 120),

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://ollama:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    timeoutMs: toNumber(process.env.OLLAMA_TIMEOUT_MS, 25000),
  },

  whisper: {
    baseUrl: process.env.WHISPER_BASE_URL || 'http://whisper:9001',
    timeoutMs: toNumber(process.env.WHISPER_TIMEOUT_MS, 30000),
  },

  tts: {
    baseUrl: process.env.TTS_BASE_URL || 'http://tts:5002',
    model: process.env.TTS_MODEL || 'kokoro',
    voice: process.env.TTS_VOICE || 'af_sarah',
    audioFormat: process.env.TTS_AUDIO_FORMAT || 'mp3',
    timeoutMs: toNumber(process.env.TTS_TIMEOUT_MS, 30000),
  },

  livekit: {
    url: process.env.LIVEKIT_URL || 'ws://livekit:7880',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    tokenTtlSeconds: toNumber(process.env.LIVEKIT_TOKEN_TTL_SECONDS, 3600),
  },

  db: {
    host: process.env.DB_HOST || 'postgres',
    port: toNumber(process.env.DB_PORT, 5432),
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'secret',
    database: process.env.DB_NAME || 'healthcare',
    ssl: toBoolean(process.env.DB_SSL, false),
    databaseUrl: process.env.DATABASE_URL || '',
    poolMax: toNumber(process.env.DB_POOL_MAX, 10),
    idleTimeoutMs: toNumber(process.env.DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMs: toNumber(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  },
};
