const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/error');

const routes = require('./routes');

const app = express();

app.set('trust proxy', 1);

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