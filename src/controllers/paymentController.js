// =============================================
// backend/src/controllers/paymentController.js
// =============================================

const { createClient } = require('@supabase/supabase-js');

class PaymentController {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Bind methods to preserve 'this' context
    this.handleWebhook = this.handleWebhook.bind(this);
    this.handlePaymentSuccess = this.handlePaymentSuccess.bind(this);
    this.handleSubscriptionCancelled = this.handleSubscriptionCancelled.bind(this);
    this.handleSubscriptionRenewed = this.handleSubscriptionRenewed.bind(this);
    this.calculateEndDate = this.calculateEndDate.bind(this);
  }

  /**
   * Ödeme gateway'lerinden gelen webhook'ları işle
   * Stripe, PayPal, Paddle vb.
   */
  async handleWebhook(req, res) {
    try {
      const { source, event_type, data } = req.body;

      // Webhook'u kaydet
      await this.supabase.from('webhooks').insert({
        source: source || 'unknown',
        event_type,
        payload: data
      });

      // Event tipine göre işle
      switch (event_type) {
        case 'payment.success':
        case 'checkout.session.completed':
          await this.handlePaymentSuccess(data);
          break;

        case 'subscription.cancelled':
          await this.handleSubscriptionCancelled(data);
          break;

        case 'subscription.renewed':
          await this.handleSubscriptionRenewed(data);
          break;

        default:
          console.log('Unhandled event type:', event_type);
      }

      return res.json({ success: true, received: true });

    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
  }

  async handlePaymentSuccess(data) {
    try {
      const { order_id, user_email, product_id, plan_type } = data;

      // Siparişi güncelle
      const { error: orderError } = await this.supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          start_date: new Date().toISOString(),
          end_date: this.calculateEndDate(plan_type)
        })
        .eq('order_number', order_id);

      if (orderError) {
        console.error('Order update error:', orderError);
        return;
      }

      // İlgili API key'leri aktifleştir
      await this.supabase
        .from('api_keys')
        .update({ status: 'active' })
        .eq('order_id', order_id);

      console.log('Payment processed successfully:', order_id);

    } catch (error) {
      console.error('Handle payment success error:', error);
    }
  }

  async handleSubscriptionCancelled(data) {
    try {
      const { order_id } = data;

      // API key'leri pasifleştir
      await this.supabase
        .from('api_keys')
        .update({ status: 'suspended' })
        .eq('order_id', order_id);

      // Siparişi güncelle
      await this.supabase
        .from('orders')
        .update({ payment_status: 'cancelled' })
        .eq('order_number', order_id);

      console.log('Subscription cancelled:', order_id);

    } catch (error) {
      console.error('Handle subscription cancelled error:', error);
    }
  }

  async handleSubscriptionRenewed(data) {
    try {
      const { order_id, plan_type } = data;

      // Yeni bitiş tarihini hesapla
      const newEndDate = this.calculateEndDate(plan_type);

      // Siparişi güncelle
      await this.supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          end_date: newEndDate
        })
        .eq('order_number', order_id);

      // API key'leri yeniden aktifleştir
      await this.supabase
        .from('api_keys')
        .update({
          status: 'active',
          expires_at: newEndDate
        })
        .eq('order_id', order_id);

      console.log('Subscription renewed:', order_id);

    } catch (error) {
      console.error('Handle subscription renewed error:', error);
    }
  }

  calculateEndDate(planType) {
    const now = new Date();

    switch (planType) {
      case 'monthly':
        return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
      case 'yearly':
        return new Date(now.setFullYear(now.getFullYear() + 1)).toISOString();
      case 'lifetime':
        return null; // Sınırsız
      default:
        return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
    }
  }
}

module.exports = new PaymentController();
