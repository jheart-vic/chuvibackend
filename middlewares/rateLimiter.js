const rateLimit = require('express-rate-limit');
const AppError = require('../util/appError');

const limiter = rateLimit({
  max: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  handler: () => new AppError('Too many requests, please try again later', 429),
});

module.exports = limiter;
