const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const presentingProblemsRoutes = require('./routes/presentingProblemsRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { nodeEnv, frontendOrigin } = require('./config/env');

function createApp() {
  const app = express();

  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  if (nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', authRoutes);
  app.use('/sessions', sessionRoutes);
  app.use('/presenting-problems', presentingProblemsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
