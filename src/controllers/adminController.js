// =============================================
// backend/src/controllers/adminController.js
// =============================================

const { createClient } = require('@supabase/supabase-js');
const SignatureService = require('../services/signatureService');

class AdminController {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Bind methods to preserve 'this' context
    this.createProduct = this.createProduct.bind(this);
    this.createApiKey = this.createApiKey.bind(this);
    this.getLogs = this.getLogs.bind(this);
    this.getProducts = this.getProducts.bind(this);
    this.getApiKeys = this.getApiKeys.bind(this);
    this.updateApiKey = this.updateApiKey.bind(this);
    this.getStats = this.getStats.bind(this);
  }

  /**
   * POST /admin/create-product
   */
  async createProduct(req, res) {
    try {
      const { name, slug, category, description, pricing, features } = req.body;

      // Benzersiz secret key oluştur
      const secretKey = 'ps_' + require('crypto').randomBytes(32).toString('hex');

      const { data, error } = await this.supabase
        .from('products')
        .insert({
          name,
          slug,
          category,
          description,
          secret_key: secretKey,
          pricing: pricing || {},
          features: features || {}
        })
        .select()
        .single();

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, data });

    } catch (error) {
      console.error('Create product error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  /**
   * GET /admin/products
   */
  async getProducts(req, res) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, data });

    } catch (error) {
      console.error('Get products error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  /**
   * GET /admin/apikeys
   * List all API keys with filtering
   */
  async getApiKeys(req, res) {
    try {
      const { product_id, status, limit = 100, offset = 0 } = req.query;

      let query = this.supabase
        .from('api_keys')
        .select(`
          id,
          api_key,
          api_secret,
          status,
          allowed_domains,
          allowed_ips,
          max_requests_per_day,
          expires_at,
          created_at,
          last_request_at,
          user:users(id, email, full_name),
          product:products(id, name, slug)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (product_id) query = query.eq('product_id', product_id);
      if (status) query = query.eq('status', status);

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
      console.error('Get API keys error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  /**
   * POST /admin/create-apikey
   */
  async createApiKey(req, res) {
    try {
      const {
        user_id,
        product_id,
        order_id,
        allowed_domains,
        allowed_ips,
        max_requests_per_day,
        expires_at
      } = req.body;

      const apiKey = 'lk_' + require('crypto').randomBytes(32).toString('hex');
      const apiSecret = 'ls_' + require('crypto').randomBytes(32).toString('hex');

      const { data, error } = await this.supabase
        .from('api_keys')
        .insert({
          user_id,
          product_id,
          order_id,
          api_key: apiKey,
          api_secret: apiSecret,
          allowed_domains: allowed_domains || [],
          allowed_ips: allowed_ips || [],
          max_requests_per_day: max_requests_per_day || 10000,
          expires_at: expires_at || null
        })
        .select(`
          *,
          product:products(name, slug),
          user:users(email, full_name)
        `)
        .single();

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({
        success: true,
        data: {
          ...data,
          api_secret: apiSecret // Sadece oluşturma sırasında göster
        }
      });

    } catch (error) {
      console.error('Create API key error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  /**
   * GET /admin/logs
   */
  async getLogs(req, res) {
    try {
      const {
        limit = 100,
        offset = 0,
        result,
        api_key_id,
        start_date,
        end_date
      } = req.query;

      let query = this.supabase
        .from('validation_logs')
        .select(`
          *,
          api_key:api_keys(api_key, user:users(email))
        `, { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      if (result) query = query.eq('result', result);
      if (api_key_id) query = query.eq('api_key_id', api_key_id);
      if (start_date) query = query.gte('timestamp', start_date);
      if (end_date) query = query.lte('timestamp', end_date);

      const { data, error, count } = await query;

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({
        success: true,
        data,
        pagination: {
          total: count,
          limit,
          offset
        }
      });

    } catch (error) {
      console.error('Get logs error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  /**
   * PATCH /admin/apikey/:id
   */
  async updateApiKey(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Güvenlik: api_key ve api_secret güncellenemez
      delete updates.api_key;
      delete updates.api_secret;

      const { data, error } = await this.supabase
        .from('api_keys')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.json({ success: true, data });

    } catch (error) {
      console.error('Update API key error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  /**
   * GET /admin/stats
   */
  async getStats(req, res) {
    try {
      // Toplam kullanıcı
      const { count: totalUsers } = await this.supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Aktif API key'ler
      const { count: activeKeys } = await this.supabase
        .from('api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Bugünkü doğrulama sayısı
      const today = new Date().toISOString().split('T')[0];
      const { count: todayValidations } = await this.supabase
        .from('validation_logs')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', today);

      // Ödenen siparişler
      const { count: paidOrders } = await this.supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'paid');

      return res.json({
        success: true,
        stats: {
          total_users: totalUsers,
          active_api_keys: activeKeys,
          validations_today: todayValidations,
          paid_orders: paidOrders
        }
      });

    } catch (error) {
      console.error('Get stats error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }
}

module.exports = new AdminController();