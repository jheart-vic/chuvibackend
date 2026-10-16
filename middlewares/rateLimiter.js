const rateLimit = require('express-rate-limit');
const AppError = require('../util/appError');

// FE 16 Oct: a request over the limit HUNG until the browser gave up (the old
// handler built an error but never sent it), and the limit was 100 requests per
// 15 minutes per IP — on the floor every station tablet shares the office's one
// internet address, so a few busy screens would have frozen everyone.
//
// Now: counted per signed-in device (its login token), else per IP; 300 requests
// a minute each; and an over-limit request gets a clear 429 at once.
const tokenOf = (req) => {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies?.accessToken || null;
};

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const t = tokenOf(req);
    return t ? `t:${t.slice(-32)}` : `ip:${req.ip}`;
  },
  validate: false,
  handler: (req, res, next) =>
    next(new AppError('Too many requests. Please wait a minute and try again.', 429)),
});

module.exports = limiter;
