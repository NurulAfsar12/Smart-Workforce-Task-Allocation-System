const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const env = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/error');
const { apiLimiter } = require('./middleware/rateLimit');

const routes = require('./routes');

const app = express();

app.set('trust proxy', 1);

// Security headers: CSP, HSTS, frame denial, MIME-sniffing prevention and
// referrer policy. Also stops Express advertising itself via X-Powered-By.
// The API only ever returns JSON, so the default CSP does not restrict it.
app.use(helmet());
app.disable('x-powered-by');

app.use(
  cors({
    origin: env.clientOrigin === '*' ? true : env.clientOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (env.env !== 'test') {
  app.use(morgan(env.env === 'development' ? 'dev' : 'combined'));
}

// Broad ceiling on API traffic. /health is excluded so monitoring and
// uptime checks are never throttled.
app.use('/api', apiLimiter);

app.get('/health', async (req, res) => {
  const db = require('./config/db');
  try {
    const dbOk = await db.healthCheck();
    res.status(dbOk ? 200 : 503).json({
      success: dbOk,
      service: 'smart-workforce-api',
      database: dbOk ? 'connected' : 'unreachable',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ success: false, database: 'unreachable', message: err.message });
  }
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;