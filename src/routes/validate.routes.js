// =============================================
// backend/src/routes/validate.routes.js
// =============================================

const express = require('express');
const router = express.Router();
const validateController = require('../controllers/validateController');
const { body, validationResult } = require('express-validator');

// Rate limiter middleware
const rateLimit = require('express-rate-limit');

const validateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 100, // IP başına max 100 istek
  message: { 
    success: false, 
    error: 'Too many requests, please try again later' 
  }
});

// Validation middleware
const validateRequestMiddleware = [
  body('product_id').notEmpty().isUUID(),
  body('domain').notEmpty().isLength({ max: 255 }),
  body('api_key').notEmpty().matches(/^lk_/),
  body('timestamp').notEmpty().isInt(),
  body('nonce').notEmpty().isLength({ min: 32, max: 128 }),
  body('signature').notEmpty().isLength({ min: 64, max: 128 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: errors.array()
        }
      });
    }
    next();
  }
];

// Routes
router.post('/request', validateLimiter, validateRequestMiddleware, validateController.validateRequest);
router.post('/challenge', validateLimiter, validateController.initiateChallenge);
router.get('/health', validateController.healthCheck);

module.exports = router;