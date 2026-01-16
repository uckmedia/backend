// =============================================
// backend/src/routes/admin.routes.js
// =============================================

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Tüm admin route'lar auth ve admin middleware gerektiriyor
router.use(authMiddleware, adminMiddleware);

router.get('/stats', adminController.getStats);
router.get('/logs', adminController.getLogs);

router.post('/create-product', adminController.createProduct);
router.post('/create-apikey', adminController.createApiKey);

router.patch('/apikey/:id', adminController.updateApiKey);

module.exports = router;