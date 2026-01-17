// =============================================
// backend/src/routes/ticket.routes.js
// =============================================

const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// All ticket routes require authentication
router.use(authMiddleware);

// Customer routes
router.post('/create', ticketController.createTicket);
router.get('/my', ticketController.getMyTickets);
router.get('/:id', ticketController.getTicketById);
router.post('/:id/message', ticketController.addMessage);

// Admin-only routes
router.get('/all', adminMiddleware, ticketController.getAllTickets);
router.patch('/:id/status', adminMiddleware, ticketController.updateTicketStatus);

module.exports = router;
