// =============================================
// backend/src/controllers/authController.js
// =============================================

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

class AuthController {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Bind methods to preserve 'this' context
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.getProfile = this.getProfile.bind(this);
  }

  async register(req, res) {
    try {
      const { email, password, full_name } = req.body;

      // Email kontrolü
      const { data: existing } = await this.supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }

      // Şifre hash
      const passwordHash = await bcrypt.hash(password, 10);

      // Kullanıcı oluştur
      const { data: user, error } = await this.supabase
        .from('users')
        .insert({
          email,
          password_hash: passwordHash,
          full_name,
          role: 'customer'
        })
        .select()
        .single();

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      // JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });

    } catch (error) {
      console.error('Register error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      const { data: user, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Şifre kontrolü
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Account is not active'
        });
      }

      // Last login güncelle
      await this.supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id);

      // JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }
  }

  async getProfile(req, res) {
    return res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        full_name: req.user.full_name,
        role: req.user.role
      }
    });
  }
}

module.exports = new AuthController();