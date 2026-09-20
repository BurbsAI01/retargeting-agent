const EmailDispatcher = require('./EmailDispatcher');
const SmsDispatcher = require('./SmsDispatcher');
const AdDispatcher = require('./AdDispatcher');

class DispatchEngine {
  constructor(pool) {
    this.pool = pool;
    this.emailDispatcher = new EmailDispatcher(pool);
    this.smsDispatcher = new SmsDispatcher(pool);
    this.adDispatcher = new AdDispatcher(pool);
  }

  async dispatchCampaign(campaignId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const campaignResult = await client.query(
        `SELECT c.*, v.email, v.phone, v.first_name, v.company_name, q.quote_details
         FROM retargeting_campaigns c
         JOIN visitors v ON c.visitor_id = v.id
         JOIN quotes q ON c.quote_id = q.id
         WHERE c.id = $1`,
        [campaignId]
      );

      if (campaignResult.rows.length === 0) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      const campaign = campaignResult.rows[0];
      const recommendation = campaign.agent_recommendation;
      const modifications = campaign.operator_modifications || {};
      const channels = modifications.channels || [];

      console.log(`Dispatching campaign ${campaignId} to channels:`, channels);

      const dispatchResults = {
        campaign_id: campaignId,
        visitor_id: campaign.visitor_id,
        channels_attempted: channels,
        dispatch_results: {},
        total_attempts: 0,
        total_succeeded: 0,
        dispatched_at: new Date().toISOString(),
      };

      for (const channel of channels) {
        try {
          dispatchResults.total_attempts++;

          switch (channel.toLowerCase()) {
            case 'email':
              const emailResult = await this.emailDispatcher.dispatch(campaign, modifications);
              dispatchResults.dispatch_results.email = emailResult;
              if (emailResult.success) dispatchResults.total_succeeded++;
              break;

            case 'sms':
              const smsResult = await this.smsDispatcher.dispatch(campaign, modifications);
              dispatchResults.dispatch_results.sms = smsResult;
              if (smsResult.success) dispatchResults.total_succeeded++;
              break;

            case 'facebook':
              const fbResult = await this.adDispatcher.dispatchFacebook(campaign, modifications);
              dispatchResults.dispatch_results.facebook = fbResult;
              if (fbResult.success) dispatchResults.total_succeeded++;
              break;

            case 'google_ads':
              const googleResult = await this.adDispatcher.dispatchGoogleAds(campaign, modifications);
              dispatchResults.dispatch_results.google_ads = googleResult;
              if (googleResult.success) dispatchResults.total_succeeded++;
              break;

            case 'linkedin':
              const linkedinResult = await this.adDispatcher.dispatchLinkedIn(campaign, modifications);
              dispatchResults.dispatch_results.linkedin = linkedinResult;
              if (linkedinResult.success) dispatchResults.total_succeeded++;
              break;

            default:
              console.warn(`Unknown channel: ${channel}`);
          }
        } catch (channelError) {
          console.error(`Error dispatching to ${channel}:`, channelError);
          dispatchResults.dispatch_results[channel] = {
            success: false,
            error: channelError.message,
          };
        }
      }

      // Update campaign status
      const newStatus =
        dispatchResults.total_succeeded > 0 ? 'dispatched' : 'dispatch_failed';

      await client.query(
        `UPDATE retargeting_campaigns
         SET campaign_status = $1,
             dispatch_log = $2,
             dispatched_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newStatus, JSON.stringify(dispatchResults), campaignId]
      );

      // Record dispatch in campaign_performance
      for (const channel of channels) {
        const result = dispatchResults.dispatch_results[channel];
        if (result && result.success) {
          await client.query(
            `INSERT INTO campaign_performance (campaign_id, channel, total_sent, calculated_at)
             VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
             ON CONFLICT (campaign_id, channel) DO UPDATE
             SET total_sent = campaign_performance.total_sent + 1,
                 calculated_at = CURRENT_TIMESTAMP`,
            [campaignId, channel]
          );
        }
      }

      await client.query('COMMIT');

      console.log(`Campaign ${campaignId} dispatch complete:`, dispatchResults);
      return dispatchResults;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Dispatch engine error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getDispatchStatus(campaignId) {
    const result = await this.pool.query(
      `SELECT dispatch_log, campaign_status, dispatched_at
       FROM retargeting_campaigns
       WHERE id = $1`,
      [campaignId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    return {
      campaign_id: campaignId,
      status: result.rows[0].campaign_status,
      dispatch_log: result.rows[0].dispatch_log,
      dispatched_at: result.rows[0].dispatched_at,
    };
  }
}

module.exports = DispatchEngine;
