const crypto = require('crypto');

class APIKeyAuth {
  constructor(pool) {
    this.pool = pool;
    this.keyCache = new Map();
  }

  generateKeyAndHash() {
    const keyPrefix = 'sig_trans_';
    const randomPart = crypto.randomBytes(24).toString('hex');
    const apiKey = keyPrefix + randomPart;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    return { apiKey, keyHash, keyPrefix };
  }

  async generateAPIKey(betaCustomerId, name = 'Default API Key') {
    const { apiKey, keyHash, keyPrefix } = this.generateKeyAndHash();

    const result = await this.pool.query(
      `INSERT INTO api_keys (beta_customer_id, name, key_prefix, key_hash, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, created_at`,
      [betaCustomerId, name, keyPrefix, keyHash]
    );

    console.log(`Generated API key for beta customer ${betaCustomerId}`);
    return {
      apiKey,
      keyId: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  }

  middleware() {
    return async (req, res, next) => {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        return res.status(401).json({ error: 'Missing X-API-Key header' });
      }

      try {
        // Check cache first
        if (this.keyCache.has(apiKey)) {
          const cached = this.keyCache.get(apiKey);
          if (cached.expiresAt > Date.now()) {
            req.betaCustomerId = cached.betaCustomerId;
            req.apiKeyId = cached.keyId;
            return next();
          }
          this.keyCache.delete(apiKey);
        }

        // Query database
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const result = await this.pool.query(
          `SELECT ak.id, ak.beta_customer_id, ak.is_active, ak.last_used_at,
                  bc.status, bc.allowed_channels
           FROM api_keys ak
           JOIN beta_customers bc ON ak.beta_customer_id = bc.id
           WHERE ak.key_hash = $1`,
          [keyHash]
        );

        if (result.rows.length === 0) {
          return res.status(403).json({ error: 'Invalid API key' });
        }

        const keyRecord = result.rows[0];

        if (!keyRecord.is_active) {
          return res.status(403).json({ error: 'API key is revoked' });
        }

        if (keyRecord.status !== 'active') {
          return res.status(403).json({ error: 'Beta customer account is not active' });
        }

        req.betaCustomerId = keyRecord.beta_customer_id;
        req.apiKeyId = keyRecord.id;
        req.allowedChannels = keyRecord.allowed_channels;

        // Cache for 1 hour
        this.keyCache.set(apiKey, {
          betaCustomerId: keyRecord.beta_customer_id,
          keyId: keyRecord.id,
          expiresAt: Date.now() + 60 * 60 * 1000,
        });

        // Update last used timestamp (async, don't wait)
        this.pool.query(
          'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
          [keyRecord.id]
        ).catch(err => console.error('Error updating API key last_used_at:', err));

        next();
      } catch (error) {
        console.error('API key verification error:', error);
        res.status(500).json({ error: 'Authentication error' });
      }
    };
  }

  async revokeAPIKey(keyId) {
    await this.pool.query('UPDATE api_keys SET is_active = false WHERE id = $1', [keyId]);
    console.log(`Revoked API key ${keyId}`);
  }
}

module.exports = APIKeyAuth;
