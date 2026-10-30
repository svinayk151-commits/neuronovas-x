/**
 * server/index.js — Express app entry point
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { getDb, initializeDatabase, closeDatabase } = require('./db/database');
const { startExpiryJob } = require('./jobs/expiry');

const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const requestRoutes = require('./routes/requests');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', async (req, res, next) => {
  try {
    await getDb().prepare('SELECT 1').get();
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

app.use((error, req, res, next) => {
  console.error('[API] Request failed:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  await initializeDatabase();
  const existingUser = await getDb().prepare('SELECT id FROM users LIMIT 1').get();
  if (!existingUser) {
    await require('./db/seed').seedData();
  }

  startExpiryJob();
  app.listen(PORT, () => {
    console.log(`\n🌱 Food Donation Platform API running on http://localhost:${PORT}`);
    console.log(`   API health: http://localhost:${PORT}/api/health\n`);
  });
}

if (require.main === module) {
  startServer().catch(async error => {
    console.error('[Startup] Could not initialize the application:', error.message);
    await closeDatabase();
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
