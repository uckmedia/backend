// =============================================
// backend/src/services/logService.js
// =============================================

const { createClient } = require('@supabase/supabase-js');

class LogService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  async log(logData, responseTime) {
    try {
      const logEntry = {
        api_key_id: logData.api_key_id || null,
        product_id: logData.product_id || null,
        domain: logData.domain,
        ip_address: logData.ip_address,
        user_agent: logData.user_agent || null,
        result: logData.result,
        error_code: logData.error_code || null,
        error_message: logData.error_message || null,
        request_data: logData.request_data || {},
        response_time: responseTime,
        created_at: new Date().toISOString()
      };

      await this.supabase.from('validation_logs').insert(logEntry);

      // Emit to socket for real-time dashboard
      if (global.io) {
        global.io.emit('security_log', logEntry);
      }
    } catch (error) {
      console.error('Log error:', error);
    }
  }
}

module.exports = new LogService();