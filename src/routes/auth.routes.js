// =============================================
// backend/src/routes/auth.routes.js
// =============================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Validation failed',
      details: errors.array() 
    });
  }
  next();
};

router.post('/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('full_name').notEmpty(),
  validateRequest
], authController.register);

router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
  validateRequest
], authController.login);

router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;