// =============================================
// backend/src/controllers/customerController.js
// =============================================

const { createClient } = require('@supabase/supabase-js');

class CustomerController {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Bind methods to preserve 'this' context
    this.getMyProducts = this.getMyProducts.bind(this);
    this.getMyApiKeys = this.getMyApiKeys.bind(this);
    this.getMyOrders = this.getMyOrders.bind(this);
    this.updateApiKeyDomains = this.updateApiKeyDomains.bind(this);
  }

  async getMyProducts(req, res) {
    try {
      const { data, error } = await this.supabase
        .from('orders')
        .select(`
          *,
          product:products(*)
        `)
        .eq('user_id', req.user.id)
        .eq('payment_status', 'paid');

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, data });

    } catch (error) {
      console.error('Get products error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  async getMyApiKeys(req, res) {
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .select(`
          *,
          product:products(name, slug),
          order:orders(end_date, payment_status)
        `)
        .eq('user_id', req.user.id);

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      // API secret'ı gizle
      const sanitized = data.map(key => {
        const { api_secret, ...rest } = key;
        return rest;
      });

      return res.json({ success: true, data: sanitized });

    } catch (error) {
      console.error('Get API keys error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  async getMyOrders(req, res) {
    try {
      const { data, error } = await this.supabase
        .from('orders')
        .select(`
          *,
          product:products(name, slug)
        `)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, data });

    } catch (error) {
      console.error('Get orders error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  async updateApiKeyDomains(req, res) {
    try {
      const { id } = req.params;
      const { allowed_domains, allowed_ips } = req.body;

      // Kullanıcının bu key'e sahip olduğunu kontrol et
      const { data: apiKey, error: checkError } = await this.supabase
        .from('api_keys')
        .select('user_id')
        .eq('id', id)
        .single();

      if (checkError || !apiKey || apiKey.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      // Güncelle
      const { data, error } = await this.supabase
        .from('api_keys')
        .update({
          allowed_domains: allowed_domains || [],
          allowed_ips: allowed_ips || []
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, data });

    } catch (error) {
      console.error('Update API key domains error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }
}

module.exports = new CustomerController();