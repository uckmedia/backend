// =============================================
// backend/src/controllers/ticketController.js
// =============================================

const { createClient } = require('@supabase/supabase-js');

class TicketController {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        this.createTicket = this.createTicket.bind(this);
        this.getMyTickets = this.getMyTickets.bind(this);
        this.getAllTickets = this.getAllTickets.bind(this);
        this.getTicketById = this.getTicketById.bind(this);
        this.addMessage = this.addMessage.bind(this);
        this.updateTicketStatus = this.updateTicketStatus.bind(this);
    }

    /**
     * POST /tickets/create
     * Customer creates a new ticket
     */
    async createTicket(req, res) {
        try {
            const { subject, message, priority = 'medium', category = 'general' } = req.body;
            const userId = req.user.id;

            const { data: ticket, error } = await this.supabase
                .from('tickets')
                .insert({
                    user_id: userId,
                    subject,
                    priority,
                    category,
                    status: 'open'
                })
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, error: error.message });
            }

            // Add the initial message
            await this.supabase.from('ticket_messages').insert({
                ticket_id: ticket.id,
                user_id: userId,
                message,
                is_admin: false
            });

            return res.json({ success: true, data: ticket });

        } catch (error) {
            console.error('Create ticket error:', error);
            return res.status(500).json({ success: false, error: 'Internal error' });
        }
    }

    /**
     * GET /tickets/my
     * Customer gets their own tickets
     */
    async getMyTickets(req, res) {
        try {
            const userId = req.user.id;

            const { data, error } = await this.supabase
                .from('tickets')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false });

            if (error) {
                return res.status(400).json({ success: false, error: error.message });
            }

            return res.json({ success: true, data });

        } catch (error) {
            console.error('Get my tickets error:', error);
            return res.status(500).json({ success: false, error: 'Internal error' });
        }
    }

    /**
     * GET /tickets/all (Admin only)
     * Admin gets all tickets
     */
    async getAllTickets(req, res) {
        try {
            const { status, priority, limit = 50, offset = 0 } = req.query;

            let query = this.supabase
                .from('tickets')
                .select(`
          *,
          user:users(id, email, full_name)
        `, { count: 'exact' })
                .order('updated_at', { ascending: false })
                .range(offset, offset + parseInt(limit) - 1);

            if (status) query = query.eq('status', status);
            if (priority) query = query.eq('priority', priority);

            const { data, error, count } = await query;

            if (error) {
                return res.status(400).json({ success: false, error: error.message });
            }

            return res.json({
                success: true,
                data,
                pagination: { total: count, limit: parseInt(limit), offset: parseInt(offset) }
            });

        } catch (error) {
            console.error('Get all tickets error:', error);
            return res.status(500).json({ success: false, error: 'Internal error' });
        }
    }

    /**
     * GET /tickets/:id
     * Get ticket details with messages
     */
    async getTicketById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const isAdmin = req.user.role === 'admin';

            let query = this.supabase
                .from('tickets')
                .select(`
          *,
          user:users(id, email, full_name),
          messages:ticket_messages(
            id, message, image_url, is_admin, created_at,
            user:users(id, email, full_name)
          )
        `)
                .eq('id', id)
                .single();

            const { data, error } = await query;

            if (error) {
                return res.status(404).json({ success: false, error: 'Ticket not found' });
            }

            // Non-admins can only view their own tickets
            if (!isAdmin && data.user_id !== userId) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            return res.json({ success: true, data });

        } catch (error) {
            console.error('Get ticket error:', error);
            return res.status(500).json({ success: false, error: 'Internal error' });
        }
    }

    /**
     * POST /tickets/:id/message
     * Add a message to a ticket
     */
    async addMessage(req, res) {
        try {
            const { id } = req.params;
            const { message, image_url } = req.body;
            const userId = req.user.id;
            const isAdmin = req.user.role === 'admin';

            // Verify access
            const { data: ticket } = await this.supabase
                .from('tickets')
                .select('user_id')
                .eq('id', id)
                .single();

            if (!ticket) {
                return res.status(404).json({ success: false, error: 'Ticket not found' });
            }

            if (!isAdmin && ticket.user_id !== userId) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const { data, error } = await this.supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: id,
                    user_id: userId,
                    message,
                    image_url: image_url || null,
                    is_admin: isAdmin
                })
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, error: error.message });
            }

            // Update ticket's updated_at
            await this.supabase
                .from('tickets')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', id);

            return res.json({ success: true, data });

        } catch (error) {
            console.error('Add message error:', error);
            return res.status(500).json({ success: false, error: 'Internal error' });
        }
    }

    /**
     * PATCH /tickets/:id/status (Admin only)
     * Update ticket status
     */
    async updateTicketStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ success: false, error: 'Invalid status' });
            }

            const { data, error } = await this.supabase
                .from('tickets')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, error: error.message });
            }

            return res.json({ success: true, data });

        } catch (error) {
            console.error('Update ticket status error:', error);
            return res.status(500).json({ success: false, error: 'Internal error' });
        }
    }
}

module.exports = new TicketController();
