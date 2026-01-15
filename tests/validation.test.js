// =============================================
// backend/tests/validation.test.js
// =============================================

const request = require('supertest');
const app = require('../src/app');
const SignatureService = require('../src/services/signatureService');

describe('License Validation Tests', () => {
  const validApiKey = 'lk_test_key_123';
  const validApiSecret = 'ls_test_secret_456';
  const productId = 'test-product-uuid';
  const domain = 'example.com';

  test('Should validate successfully with correct signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = SignatureService.generateNonce();
    
    const requestData = {
      product_id: productId,
      domain,
      api_key: validApiKey,
      timestamp,
      nonce
    };

    const signature = SignatureService.sign(requestData, validApiSecret);

    const response = await request(app)
      .post('/validate/request')
      .send({ ...requestData, signature });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.valid).toBe(true);
  });

  test('Should fail with invalid signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = SignatureService.generateNonce();
    
    const requestData = {
      product_id: productId,
      domain,
      api_key: validApiKey,
      timestamp,
      nonce,
      signature: 'invalid_signature_here'
    };

    const response = await request(app)
      .post('/validate/request')
      .send(requestData);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_SIGNATURE');
  });

  test('Should fail with expired timestamp', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 60; // 60 saniye önce
    const nonce = SignatureService.generateNonce();
    
    const requestData = {
      product_id: productId,
      domain,
      api_key: validApiKey,
      timestamp: oldTimestamp,
      nonce
    };

    const signature = SignatureService.sign(requestData, validApiSecret);

    const response = await request(app)
      .post('/validate/request')
      .send({ ...requestData, signature });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVALID_TIMESTAMP');
  });

  test('Should fail with unauthorized domain', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = SignatureService.generateNonce();
    
    const requestData = {
      product_id: productId,
      domain: 'unauthorized-domain.com', // Yetkisiz domain
      api_key: validApiKey,
      timestamp,
      nonce
    };

    const signature = SignatureService.sign(requestData, validApiSecret);

    const response = await request(app)
      .post('/validate/request')
      .send({ ...requestData, signature });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('DOMAIN_NOT_ALLOWED');
  });

  test('Should fail with missing required fields', async () => {
    const response = await request(app)
      .post('/validate/request')
      .send({
        product_id: productId,
        // domain eksik
        api_key: validApiKey
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MISSING_FIELDS');
  });

  test('Should prevent replay attacks (nonce reuse)', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = SignatureService.generateNonce();
    
    const requestData = {
      product_id: productId,
      domain,
      api_key: validApiKey,
      timestamp,
      nonce
    };

    const signature = SignatureService.sign(requestData, validApiSecret);
    const payload = { ...requestData, signature };

    // İlk istek başarılı olmalı
    const response1 = await request(app)
      .post('/validate/request')
      .send(payload);

    expect(response1.status).toBe(200);

    // Aynı nonce ile ikinci istek başarısız olmalı
    const response2 = await request(app)
      .post('/validate/request')
      .send(payload);

    expect(response2.status).toBe(403);
    expect(response2.body.error.code).toBe('INVALID_NONCE');
  });
});

describe('SignatureService Tests', () => {
  test('Should create consistent signatures', () => {
    const data = {
      product_id: 'test',
      domain: 'example.com',
      api_key: 'key123',
      timestamp: 1234567890,
      nonce: 'nonce123'
    };

    const secret = 'test_secret';
    
    const sig1 = SignatureService.sign(data, secret);
    const sig2 = SignatureService.sign(data, secret);

    expect(sig1).toBe(sig2);
  });

  test('Should verify valid signatures', () => {
    const data = { test: 'value', foo: 'bar' };
    const secret = 'secret';
    
    const signature = SignatureService.sign(data, secret);
    const isValid = SignatureService.verify(data, signature, secret);

    expect(isValid).toBe(true);
  });

  test('Should reject invalid signatures', () => {
    const data = { test: 'value' };
    const isValid = SignatureService.verify(data, 'wrong_signature', 'secret');

    expect(isValid).toBe(false);
  });

  test('Should validate timestamp correctly', () => {
    const now = Math.floor(Date.now() / 1000);
    
    expect(SignatureService.isTimestampValid(now, 15)).toBe(true);
    expect(SignatureService.isTimestampValid(now - 20, 15)).toBe(false);
    expect(SignatureService.isTimestampValid(now + 20, 15)).toBe(false);
  });

  test('Should check domain permissions', () => {
    expect(SignatureService.isDomainAllowed('example.com', ['example.com'])).toBe(true);
    expect(SignatureService.isDomainAllowed('www.example.com', ['example.com'])).toBe(true);
    expect(SignatureService.isDomainAllowed('sub.example.com', ['*.example.com'])).toBe(true);
    expect(SignatureService.isDomainAllowed('other.com', ['example.com'])).toBe(false);
  });

  test('Should check IP permissions', () => {
    expect(SignatureService.isIpAllowed('192.168.1.1', ['192.168.1.1'])).toBe(true);
    expect(SignatureService.isIpAllowed('192.168.1.100', ['192.168.1.*'])).toBe(true);
    expect(SignatureService.isIpAllowed('10.0.0.1', ['192.168.1.*'])).toBe(false);
  });
});

// =============================================
// DEPLOYMENT GUIDE
// =============================================

/*
# 🚀 DEPLOYMENT GUIDE

## 1. SUPABASE SETUP

1. https://supabase.com adresinden ücretsiz hesap oluştur
2. Yeni proje oluştur
3. SQL Editor'de migration scriptini çalıştır:
   - supabase/migrations/001_initial_schema.sql

4. Project Settings > API'den şunları kopyala:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_KEY

5. Edge Function Deploy:
   ```bash
   cd supabase
   supabase login
   supabase link --project-ref your-project-ref
   supabase functions deploy validate-license
   ```

## 2. BACKEND DEPLOYMENT (Railway/Render/Heroku)

### Railway (Önerilen - Ücretsiz)
1. https://railway.app → GitHub ile bağlan
2. New Project → Deploy from GitHub repo
3. Backend klasörünü seç
4. Environment variables ekle:
   ```
   PORT=5000
   NODE_ENV=production
   SUPABASE_URL=your_url
   SUPABASE_ANON_KEY=your_key
   SUPABASE_SERVICE_KEY=your_service_key
   JWT_SECRET=your_secret_min_32_chars
   PRIMARY_DOMAIN=your-app.railway.app
   ALLOWED_ORIGINS=https://your-admin-panel.vercel.app
   ```

5. Deploy!

### Render (Alternatif)
1. https://render.com → New Web Service
2. GitHub repo bağla
3. Build Command: `cd backend && npm install`
4. Start Command: `cd backend && npm start`
5. Environment variables ekle (yukarıdaki gibi)

## 3. ADMIN PANEL DEPLOYMENT (Vercel)

1. https://vercel.com → Import Project
2. GitHub repo seç
3. Root Directory: `admin-panel`
4. Framework Preset: Vite
5. Environment Variables:
   ```
   VITE_API_URL=https://your-backend.railway.app
   VITE_SUPABASE_URL=your_url
   VITE_SUPABASE_ANON_KEY=your_key
   ```

6. Deploy!

## 4. CUSTOM DOMAIN SETUP

### Backend Domain (api.yourdomain.com)
1. Railway/Render → Settings → Custom Domain
2. DNS A record ekle:
   ```
   Type: CNAME
   Name: api
   Value: your-app.railway.app
   ```

### Admin Panel (admin.yourdomain.com)
1. Vercel → Settings → Domains
2. DNS CNAME record ekle:
   ```
   Type: CNAME
   Name: admin
   Value: cname.vercel-dns.com
   ```

## 5. FAILOVER SETUP

### Primary: api.yourdomain.com
### Backup: backup.yourdomain.com

İki ayrı Railway/Render instance kurabilirsiniz:
1. Primary instance → Railway
2. Backup instance → Render

Client SDK otomatik failover yapacak.

## 6. AUTOMATED BACKUPS

Supabase Dashboard → Database → Backups
- Daily backups otomatik
- Point-in-time recovery available

## 7. MONITORING

### Backend Monitoring
- Railway/Render built-in logs
- Supabase → Logs → Function Logs

### Uptime Monitoring
- uptimerobot.com (ücretsiz)
- healthchecks.io (ücretsiz)

Monitor endpoints:
- https://api.yourdomain.com/health
- https://backup.yourdomain.com/health

## 8. SECURITY CHECKLIST

✅ Environment variables güvenli saklanıyor
✅ CORS sadece izin verilen domainler
✅ Rate limiting aktif
✅ JWT token expiry 7 gün
✅ API keys encrypted in transit (HTTPS)
✅ SQL injection protected (Supabase parametrized queries)
✅ Webhook signature validation
✅ Domain/IP whitelisting
✅ Nonce-based replay attack prevention

## 9. PRODUCTION READY CHECKLIST

✅ Database migration çalıştırıldı
✅ Edge function deploy edildi
✅ Backend deploy edildi
✅ Admin panel deploy edildi
✅ Custom domains kuruldu
✅ SSL certificates aktif (otomatik)
✅ Environment variables set
✅ Rate limiting test edildi
✅ Validation flow test edildi
✅ Backup strategy var
✅ Monitoring kuruldu

## 10. FIRST STEPS AFTER DEPLOYMENT

1. Admin panel'e giriş yap
2. İlk ürünü oluştur
3. Test kullanıcısı oluştur
4. API key generate et
5. Client SDK ile test et
6. Webhook test et (test payment)
7. Logs kontrol et

## 11. CLIENT SDK INTEGRATION

Müşterilerinize şu dosyayı verin:
- client-sdk/nodejs/src/LicenseValidator.js
- client-sdk/nodejs/example.js

Örnek entegrasyon:
```javascript
const LicenseValidator = require('./LicenseValidator');

const validator = new LicenseValidator({
  productId: 'uuid-from-admin-panel',
  apiKey: 'lk_from_admin_panel',
  apiSecret: 'ls_from_admin_panel',
  domain: 'customer-domain.com',
});

async function startApp() {
  const isValid = await validator.validate();
  if (!isValid) process.exit(1);
  
  // Start app...
  validator.startPeriodicValidation(30);
}
```

## 12. SCALING

Free tier limits:
- Supabase: 500MB database, 2GB bandwidth
- Railway: 500 execution hours/month
- Vercel: Unlimited deployments

Eğer büyürseniz:
- Supabase Pro: $25/month
- Railway Pro: $5/month + usage
- Vercel Pro: $20/month

## 13. SUPPORT

Email: support@yourdomain.com
Docs: https://docs.yourdomain.com
Status: https://status.yourdomain.com

---

Tüm sistem şimdi production-ready! 🎉
*/