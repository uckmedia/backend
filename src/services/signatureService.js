// backend/src/services/signatureService.js
// HMAC SHA256 İmzalama ve Doğrulama Servisi

const crypto = require('crypto');

class SignatureService {
  /**
   * HMAC SHA256 ile veri imzalama
   * @param {Object} data - İmzalanacak veri
   * @param {string} secret - Secret key
   * @returns {string} - Hex formatında signature
   */
  static sign(data, secret) {
    const payload = this.createPayload(data);
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * İmza doğrulama
   * @param {Object} data - Doğrulanacak veri
   * @param {string} signature - Gelen signature
   * @param {string} secret - Secret key
   * @returns {boolean}
   */
  static verify(data, signature, secret) {
    const expectedSignature = this.sign(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Veriyi deterministik string'e çevir
   * @param {Object} data
   * @returns {string}
   */
  static createPayload(data) {
    // Objeyi alfabetik sıraya göre sırala
    const sortedKeys = Object.keys(data).sort();
    const parts = [];

    for (const key of sortedKeys) {
      if (data[key] !== undefined && data[key] !== null) {
        parts.push(`${key}=${data[key]}`);
      }
    }

    return parts.join('&');
  }

  /**
   * Nonce oluştur
   * @returns {string}
   */
  static generateNonce() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Timestamp doğrulama (15 saniye tolerans)
   * @param {number} timestamp
   * @param {number} toleranceSeconds
   * @returns {boolean}
   */
  static isTimestampValid(timestamp, toleranceSeconds = 15) {
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - timestamp);
    return diff <= toleranceSeconds;
  }

  /**
   * Challenge-Response için challenge oluştur
   * @param {string} apiKey
   * @param {string} productSecret
   * @returns {Object}
   */
  static createChallenge(apiKey, productSecret) {
    const nonce = this.generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    
    const challengeData = {
      api_key: apiKey,
      nonce,
      timestamp
    };

    const signature = this.sign(challengeData, productSecret);

    return {
      nonce,
      timestamp,
      signature,
      expires_at: timestamp + 60 // 60 saniye geçerli
    };
  }

  /**
   * Challenge-Response doğrulama
   * @param {Object} response
   * @param {string} expectedNonce
   * @param {string} productSecret
   * @returns {boolean}
   */
  static verifyChallengeResponse(response, expectedNonce, productSecret) {
    const { api_key, nonce, timestamp, signature } = response;

    // Nonce kontrolü
    if (nonce !== expectedNonce) {
      return false;
    }

    // Timestamp kontrolü
    if (!this.isTimestampValid(timestamp, 60)) {
      return false;
    }

    // Signature kontrolü
    const data = { api_key, nonce, timestamp };
    return this.verify(data, signature, productSecret);
  }

  /**
   * Tam doğrulama isteği için signature oluştur
   * @param {Object} params
   * @param {string} apiSecret - Client'ın secret key'i
   * @returns {string}
   */
  static signValidationRequest(params, apiSecret) {
    const requiredFields = {
      product_id: params.product_id,
      domain: params.domain,
      api_key: params.api_key,
      timestamp: params.timestamp,
      nonce: params.nonce
    };

    return this.sign(requiredFields, apiSecret);
  }

  /**
   * IP adresini hash'le (privacy için)
   * @param {string} ip
   * @returns {string}
   */
  static hashIp(ip) {
    return crypto
      .createHash('sha256')
      .update(ip)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Domain'i normalize et
   * @param {string} domain
   * @returns {string}
   */
  static normalizeDomain(domain) {
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');
  }

  /**
   * IP adresi kontrolü
   * @param {string} ip
   * @param {Array} allowedIps
   * @returns {boolean}
   */
  static isIpAllowed(ip, allowedIps) {
    if (!allowedIps || allowedIps.length === 0) {
      return true; // IP kısıtlaması yok
    }

    // Wildcard desteği (örn: 192.168.1.*)
    return allowedIps.some(allowedIp => {
      if (allowedIp.includes('*')) {
        const pattern = allowedIp.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(ip);
      }
      return allowedIp === ip;
    });
  }

  /**
   * Domain kontrolü
   * @param {string} domain
   * @param {Array} allowedDomains
   * @returns {boolean}
   */
  static isDomainAllowed(domain, allowedDomains) {
    if (!allowedDomains || allowedDomains.length === 0) {
      return false; // Domain kısıtlaması zorunlu
    }

    const normalizedDomain = this.normalizeDomain(domain);

    return allowedDomains.some(allowedDomain => {
      const normalizedAllowed = this.normalizeDomain(allowedDomain);
      
      // Wildcard subdomain desteği (örn: *.example.com)
      if (normalizedAllowed.startsWith('*.')) {
        const baseDomain = normalizedAllowed.substring(2);
        return normalizedDomain.endsWith(baseDomain);
      }
      
      return normalizedDomain === normalizedAllowed;
    });
  }

  /**
   * Rate limit token oluştur
   * @param {string} apiKeyId
   * @param {string} date - YYYY-MM-DD format
   * @returns {string}
   */
  static generateRateLimitKey(apiKeyId, date) {
    return `ratelimit:${apiKeyId}:${date}`;
  }
}

module.exports = SignatureService;

// =========================================
// KULLANIM ÖRNEKLERİ
// =========================================

/*
// 1. İmza oluşturma
const data = {
  product_id: 'prod_123',
  domain: 'example.com',
  api_key: 'lk_abc123',
  timestamp: Math.floor(Date.now() / 1000),
  nonce: SignatureService.generateNonce()
};

const signature = SignatureService.sign(data, 'secret_key');

// 2. İmza doğrulama
const isValid = SignatureService.verify(data, signature, 'secret_key');

// 3. Challenge oluştur
const challenge = SignatureService.createChallenge('lk_abc123', 'product_secret');

// 4. Domain kontrolü
const isDomainOk = SignatureService.isDomainAllowed(
  'https://www.example.com',
  ['example.com', '*.example.com']
);

// 5. IP kontrolü
const isIpOk = SignatureService.isIpAllowed(
  '192.168.1.100',
  ['192.168.1.*', '10.0.0.1']
);
*/