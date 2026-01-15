// =============================================
// backend/src/routes/customer.routes.js
// =============================================

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/products', customerController.getMyProducts);
router.get('/apikeys', customerController.getMyApiKeys);
router.get('/orders', customerController.getMyOrders);

router.patch('/apikey/:id/domains', customerController.updateApiKeyDomains);

module.exports = router;