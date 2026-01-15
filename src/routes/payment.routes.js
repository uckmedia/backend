// =============================================
// backend/src/routes/payment.routes.js
// =============================================

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Webhook endpoint (no auth required - Stripe/PayPal will send directly)
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;