// backend/src/services/validationService.js
// Ana Lisans Doğrulama Servisi

const { createClient } = require('@supabase/supabase-js');
const SignatureService = require('./signatureService');
const LogService = require('./logService');

class ValidationService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  /**
   * ANA DOĞRULAMA FONKSİYONU
   * Tüm güvenlik kontrolleri bu fonksiyonda yapılır
   */
  async validateLicense(requestData, clientIp) {
    const startTime = Date.now();
    let logData = {
      domain: requestData.domain,
      ip_address: clientIp,
      result: 'failed',
      request_data: requestData
    };

    try {
      // 1. ZOT:UNLU ALAN KONTROLÜ
      const requiredFields = ['product_id', 'domain', 'api_key', 'timestamp', 'nonce', 'signature'];
      const missing = requiredFields.filter(field => !requestData[field]);
      
      if (missing.length > 0) {
        return this.createErrorResponse(
          'MISSING_FIELDS',
          `Missing required fields: ${missing.join(', ')}`,
          logData,
          startTime
        );
      }

      // 2. TIMESTAMP KONTROLÜ (15 saniye tolerans)
      if (!SignatureService.isTimestampValid(requestData.timestamp, 15)) {
        return this.createErrorResponse(
          'INVALID_TIMESTAMP',
          'Request timestamp is too old or in the future',
          logData,
          startTime
        );
      }

      // 3. API KEY KONTROLÜ - Veritabanından getir
      const { data: apiKeyData, error: apiKeyError } = await this.supabase
        .from('api_keys')
        .select(`
          *,
          product:products(*),
          user:users(id, email, status),
          order:orders(payment_status, end_date)
        `)
        .eq('api_key', requestData.api_key)
        .single();

      if (apiKeyError || !apiKeyData) {
        return this.createErrorResponse(
          'INVALID_API_KEY',
          'API key not found',
          logData,
          startTime
        );
      }

      logData.api_key_id = apiKeyData.id;
      logData.product_id = apiKeyData.product_id;

      // 4. API KEY STATUS KONTROLÜ
      if (apiKeyData.status !== 'active') {
        return this.createErrorResponse(
          'API_KEY_INACTIVE',
          `API key status: ${apiKeyData.status}`,
          logData,
          startTime
        );
      }

      // 5. ÜRÜN KONTROLÜ
      if (!apiKeyData.product || apiKeyData.product.status !== 'active') {
        return this.createErrorResponse(
          'PRODUCT_INACTIVE',
          'Product is not active',
          logData,
          startTime
        );
      }

      // 6. PRODUCT_ID EŞLEŞME KONTROLÜ
      if (apiKeyData.product_id !== requestData.product_id) {
        return this.createErrorResponse(
          'PRODUCT_MISMATCH',
          'API key does not belong to this product',
          logData,
          startTime
        );
      }

      // 7. KULLANICI KONTROLÜ
      if (apiKeyData.user.status !== 'active') {
        return this.createErrorResponse(
          'USER_SUSPENDED',
          'User account is not active',
          logData,
          startTime
        );
      }

      // 8. ABONELİK KONTROLÜ
      if (apiKeyData.order) {
        if (apiKeyData.order.payment_status !== 'paid') {
          return this.createErrorResponse(
            'PAYMENT_REQUIRED',
            'Payment not completed',
            logData,
            startTime
          );
        }

        // Süre kontrolü
        if (apiKeyData.order.end_date && new Date(apiKeyData.order.end_date) < new Date()) {
          // API key'i otomatik pasifleştir
          await this.supabase
            .from('api_keys')
            .update({ status: 'expired' })
            .eq('id', apiKeyData.id);

          return this.createErrorResponse(
            'SUBSCRIPTION_EXPIRED',
            'Subscription has expired',
            logData,
            startTime
          );
        }
      }

      // 9. DOMAIN KONTROLÜ
      if (!SignatureService.isDomainAllowed(requestData.domain, apiKeyData.allowed_domains)) {
        return this.createErrorResponse(
          'DOMAIN_NOT_ALLOWED',
          `Domain ${requestData.domain} is not authorized`,
          logData,
          startTime
        );
      }

      // 10. IP KONTROLÜ
      if (!SignatureService.isIpAllowed(clientIp, apiKeyData.allowed_ips)) {
        return this.createErrorResponse(
          'IP_NOT_ALLOWED',
          `IP ${clientIp} is not authorized`,
          logData,
          startTime
        );
      }

      // 11. RATE LIMIT KONTROLÜ
      const rateLimitCheck = await this.checkRateLimit(apiKeyData.id, apiKeyData.max_requests_per_day);
      if (!rateLimitCheck.allowed) {
        return this.createErrorResponse(
          'RATE_LIMIT_EXCEEDED',
          `Daily limit of ${apiKeyData.max_requests_per_day} requests exceeded`,
          logData,
          startTime
        );
      }

      // 12. NONCE KONTROLÜ (Replay attack prevention)
      const nonceCheck = await this.checkAndMarkNonce(requestData.nonce, apiKeyData.id);
      if (!nonceCheck.valid) {
        return this.createErrorResponse(
          'INVALID_NONCE',
          nonceCheck.message,
          logData,
          startTime
        );
      }

      // 13. SIGNATURE KONTROLÜ - EN ÖNEMLİ KONTROL
      const signatureData = {
        product_id: requestData.product_id,
        domain: requestData.domain,
        api_key: requestData.api_key,
        timestamp: requestData.timestamp,
        nonce: requestData.nonce
      };

      const isSignatureValid = SignatureService.verify(
        signatureData,
        requestData.signature,
        apiKeyData.api_secret
      );

      if (!isSignatureValid) {
        return this.createErrorResponse(
          'INVALID_SIGNATURE',
          'Request signature verification failed',
          logData,
          startTime
        );
      }

      // 14. TÜM KONTROLLER BAŞARILI - DOĞRULAMA OK

      // Son istek zamanını güncelle
      await this.supabase
        .from('api_keys')
        .update({ 
          last_request_at: new Date().toISOString()
        })
        .eq('id', apiKeyData.id);

      // Rate limit sayacını artır
      await this.incrementRateLimit(apiKeyData.id);

      // Başarılı log
      logData.result = 'success';
      await LogService.log(logData, Date.now() - startTime);

      return {
        success: true,
        valid: true,
        message: 'License validated successfully',
        data: {
          product: {
            id: apiKeyData.product.id,
            name: apiKeyData.product.name,
            version: apiKeyData.product.version
          },
          license: {
            status: apiKeyData.status,
            expires_at: apiKeyData.order?.end_date || null
          }
        }
      };

    } catch (error) {
      console.error('Validation error:', error);
      return this.createErrorResponse(
        'INTERNAL_ERROR',
        'An error occurred during validation',
        logData,
        startTime
      );
    }
  }

  /**
   * Challenge başlatma
   */
  async initiateChallenge(apiKey, domain, clientIp) {
    try {
      const { data: apiKeyData, error } = await this.supabase
        .from('api_keys')
        .select('id, api_secret, product:products(secret_key)')
        .eq('api_key', apiKey)
        .eq('status', 'active')
        .single();

      if (error || !apiKeyData) {
        return {
          success: false,
          error: 'INVALID_API_KEY'
        };
      }

      const challenge = SignatureService.createChallenge(
        apiKey,
        apiKeyData.product.secret_key
      );

      // Nonce'u veritabanına kaydet
      await this.supabase.from('nonce_store').insert({
        nonce: challenge.nonce,
        api_key_id: apiKeyData.id,
        expires_at: new Date(challenge.expires_at * 1000).toISOString()
      });

      return {
        success: true,
        challenge: {
          nonce: challenge.nonce,
          timestamp: challenge.timestamp,
          expires_in: 60
        }
      };

    } catch (error) {
      console.error('Challenge error:', error);
      return {
        success: false,
        error: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Rate limit kontrolü
   */
  async checkRateLimit(apiKeyId, maxRequests) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase
      .from('rate_limit_tracking')
      .select('request_count')
      .eq('api_key_id', apiKeyId)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found error
      return { allowed: true }; // İlk istek
    }

    const currentCount = data?.request_count || 0;
    return {
      allowed: currentCount < maxRequests,
      current: currentCount,
      limit: maxRequests
    };
  }

  /**
   * Rate limit sayacını artır
   */
  async incrementRateLimit(apiKeyId) {
    const today = new Date().toISOString().split('T')[0];

    await this.supabase.rpc('increment_rate_limit', {
      p_api_key_id: apiKeyId,
      p_date: today
    });
  }

  /**
   * Nonce kontrolü ve kullanıldı işareti
   */
  async checkAndMarkNonce(nonce, apiKeyId) {
    const { data, error } = await this.supabase
      .from('nonce_store')
      .select('*')
      .eq('nonce', nonce)
      .eq('api_key_id', apiKeyId)
      .single();

    if (error || !data) {
      return { valid: false, message: 'Nonce not found' };
    }

    if (data.used) {
      return { valid: false, message: 'Nonce already used (replay attack)' };
    }

    if (new Date(data.expires_at) < new Date()) {
      return { valid: false, message: 'Nonce expired' };
    }

    // Nonce'u kullanıldı olarak işaretle
    await this.supabase
      .from('nonce_store')
      .update({ used: true })
      .eq('id', data.id);

    return { valid: true };
  }

  /**
   * Hata response oluştur ve logla
   */
  async createErrorResponse(errorCode, errorMessage, logData, startTime) {
    logData.result = 'failed';
    logData.error_code = errorCode;
    logData.error_message = errorMessage;

    await LogService.log(logData, Date.now() - startTime);

    return {
      success: false,
      valid: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    };
  }
}

module.exports = new ValidationService();