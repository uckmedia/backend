// backend/src/controllers/validateController.js

const ValidationService = require('../services/validationService');

class ValidateController {
  /**
   * POST /validate/request
   * Ana doğrulama endpoint'i
   */
  async validateRequest(req, res) {
    try {
      const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      
      const result = await ValidationService.validateLicense(req.body, clientIp);

      const statusCode = result.success ? 200 : 403;
      return res.status(statusCode).json(result);

    } catch (error) {
      console.error('Validate request error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Server error occurred'
        }
      });
    }
  }

  /**
   * POST /validate/challenge
   * Challenge-Response başlatma
   */
  async initiateChallenge(req, res) {
    try {
      const { api_key, domain } = req.body;

      if (!api_key || !domain) {
        return res.status(400).json({
          success: false,
          error: 'api_key and domain are required'
        });
      }

      const clientIp = req.ip || req.headers['x-forwarded-for'];
      const result = await ValidationService.initiateChallenge(api_key, domain, clientIp);

      return res.json(result);

    } catch (error) {
      console.error('Challenge error:', error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * GET /validate/health
   * Sunucu sağlık kontrolü (failover için)
   */
  async healthCheck(req, res) {
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      server: process.env.PRIMARY_DOMAIN || 'primary'
    });
  }
}

module.exports = new ValidateController();