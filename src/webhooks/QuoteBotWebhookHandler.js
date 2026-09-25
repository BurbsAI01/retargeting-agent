const QuoteBotService = require('../services/QuoteBotService');

class QuoteBotWebhookHandler {
  constructor(pool, quoteBotApiKey) {
    this.pool = pool;
    this.quoteBotService = new QuoteBotService(quoteBotApiKey);
  }

  /**
   * Handle Quote Bot webhook event
   * Called when a quote is generated or updated in Quote Bot
   */
  async handleWebhook(payload) {
    try {
      // Parse the Quote Bot event
      const quoteEvent = this.quoteBotService.parseWebhookEvent(payload);

      // Check if this is a new quote we should retarget
      if (quoteEvent.quoteStatus === 'abandoned' || quoteEvent.quoteStatus === 'pending') {
        if (!quoteEvent.isConverted) {
          return await this.processNewQuote(quoteEvent, payload);
        }
      }

      // If already converted, just log it
      if (quoteEvent.isConverted) {
        console.log(`Quote ${quoteEvent.quoteId} is already converted, skipping retargeting`);
        return { success: true, action: 'converted_quote_logged' };
      }

      return { success: true, action: 'quote_event_processed' };
    } catch (error) {
      console.error('Error handling Quote Bot webhook:', error);
      throw error;
    }
  }

  /**
   * Process a new unconverted quote for retargeting
   */
  async processNewQuote(quoteEvent, originalPayload) {
    const { quoteId, customerEmail, customerName, customerPhone, quoteAmount, route, vehicleType } = quoteEvent;

    try {
      // Create or update visitor
      const visitorResult = await this.pool.query(
        `INSERT INTO visitors (email, phone, first_name, company_name, last_active)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE
           SET last_active = CURRENT_TIMESTAMP, phone = COALESCE($2, phone)
         RETURNING id`,
        [customerEmail, customerPhone, customerName, 'Signature Transportation']
      );

      const visitorId = visitorResult.rows[0].id;

      // Store the quote with Quote Bot reference
      const quoteResult = await this.pool.query(
        `INSERT INTO quotes (visitor_id, quote_details, quote_url)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          visitorId,
          JSON.stringify({
            quotebot_quote_id: quoteId,
            amount: quoteAmount,
            route,
            vehicle_type: vehicleType,
            status: quoteEvent.quoteStatus,
            created_at: quoteEvent.createdAt,
            raw_payload: originalPayload
          }),
          `https://app.thequotebot.com/quotes/${quoteId}` // Link back to Quote Bot
        ]
      );

      const newQuoteId = quoteResult.rows[0].id;

      console.log(`✓ Quote Bot webhook processed: ${quoteId}`);
      console.log(`  Visitor: ${customerEmail}`);
      console.log(`  Amount: $${quoteAmount}`);
      console.log(`  Stored as quote ID: ${newQuoteId}`);

      // Queue campaign generation job (2 hour delay)
      // This would be done by the main app's job queue
      return {
        success: true,
        visitorId,
        quoteId: newQuoteId,
        quoteBotId: quoteId,
        message: 'Quote received from Quote Bot, queued for retargeting'
      };
    } catch (error) {
      console.error('Error processing Quote Bot quote:', error);
      throw error;
    }
  }

  /**
   * Sync recent quotes from Quote Bot
   * Useful for backfilling or catching missed webhooks
   */
  async syncRecentQuotes(hoursBack = 24) {
    try {
      const recentQuotes = await this.quoteBotService.getRecentQuotes(hoursBack);
      const results = {
        total: recentQuotes.length,
        processed: 0,
        skipped: 0,
        errors: []
      };

      for (const quote of recentQuotes) {
        try {
          // Check if we already have this Quote Bot quote
          const existing = await this.pool.query(
            `SELECT q.id FROM quotes q
             WHERE q.quote_details->>'quotebot_quote_id' = $1`,
            [quote.id]
          );

          if (existing.rows.length > 0) {
            results.skipped++;
            continue;
          }

          // Process the quote
          const quoteEvent = this.quoteBotService.parseWebhookEvent(quote);
          if (!quoteEvent.isConverted) {
            await this.processNewQuote(quoteEvent, quote);
            results.processed++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          results.errors.push({
            quoteId: quote.id,
            error: error.message
          });
        }
      }

      console.log(`Quote Bot sync complete: ${results.processed} processed, ${results.skipped} skipped, ${results.errors.length} errors`);
      return results;
    } catch (error) {
      console.error('Error syncing Quote Bot quotes:', error);
      throw error;
    }
  }
}

module.exports = QuoteBotWebhookHandler;
