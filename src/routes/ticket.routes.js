// =============================================
// backend/src/routes/ticket.routes.js
// =============================================

const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// All ticket routes require authentication
router.use(authMiddleware);

// Customer routes (specific routes BEFORE parameterized routes)
router.post('/create', ticketController.createTicket);
router.get('/my', ticketController.getMyTickets);

// Admin-only routes (must come BEFORE /:id to avoid conflict)
router.get('/all', adminMiddleware, ticketController.getAllTickets);

// Parameterized routes (must come AFTER specific routes)
router.get('/:id', ticketController.getTicketById);
router.post('/:id/message', ticketController.addMessage);
router.patch('/:id/status', adminMiddleware, ticketController.updateTicketStatus);

module.exports = router;
