require('dotenv').config();

const required = ['DB_USER', 'DB_NAME', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length && process.env.NODE_ENV === 'production') {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'development_only_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'smart_workforce',
  },
  // Separate, more powerful credentials used ONLY by the installer scripts.
  // The running application never uses these, so a compromised API process
  // cannot create or drop schema objects.
  dbAdmin: {
    user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || 'postgres',
  },
};