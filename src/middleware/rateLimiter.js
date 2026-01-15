// =============================================
// backend/src/middleware/rateLimiter.js
// =============================================

const rateLimit = require('express-rate-limit');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { 
      success: false, 
      error: message || 'Too many requests' 
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  apiLimiter: createRateLimiter(15 * 60 * 1000, 100), // 15 dakikada 100 istek
  authLimiter: createRateLimiter(15 * 60 * 1000, 5), // 15 dakikada 5 login denemesi
  validateLimiter: createRateLimiter(60 * 1000, 100), // 1 dakikada 100 validate
};