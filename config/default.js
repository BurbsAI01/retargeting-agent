module.exports = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Database
  database: {
    url: process.env.DATABASE_URL,
    pool: {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Claude API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 1024,
  },

  // Retargeting Rules
  retargeting: {
    triggerHours: parseInt(process.env.RETARGET_TRIGGER_HOURS) || 2,
    hotLeadThreshold: parseInt(process.env.HOT_LEAD_THRESHOLD) || 75,
    coldLeadThreshold: parseInt(process.env.COLD_LEAD_THRESHOLD) || 40,
    defaultMaxDiscountPercent:
      parseInt(process.env.DEFAULT_MAX_DISCOUNT_PERCENT) || 15,
    requireApprovalAbovePercent: parseInt(
      process.env.REQUIRE_APPROVAL_FOR_DISCOUNT_ABOVE_PERCENT
    ),
  },

  // Channels
  channels: {
    email: {
      enabled: true,
      provider: 'sendgrid',
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.SENDGRID_FROM_EMAIL,
      fromName: process.env.SENDGRID_FROM_NAME,
    },
    sms: {
      enabled: true,
      provider: 'twilio',
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
    facebook: {
      enabled: process.env.ENABLE_FACEBOOK_RETARGETING === 'true',
      accessToken: process.env.FACEBOOK_ACCESS_TOKEN,
      pixelId: process.env.FACEBOOK_PIXEL_ID,
      adAccountId: process.env.FACEBOOK_AD_ACCOUNT_ID,
    },
    googleAds: {
      enabled: process.env.ENABLE_GOOGLE_ADS_RETARGETING === 'true',
      clientId: process.env.GOOGLE_ADS_CLIENT_ID,
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
    },
    linkedin: {
      enabled: process.env.ENABLE_LINKEDIN_RETARGETING === 'true',
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      orgId: process.env.LINKEDIN_ORG_ID,
    },
  },

  // Feature Flags
  features: {
    autoApproval: process.env.ENABLE_AUTO_APPROVAL === 'true',
    personalizedOffers: process.env.ENABLE_PERSONALIZED_OFFERS !== 'false',
    multiChannelDispatch: true,
  },

  // Webhooks
  webhooks: {
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET,
    sendgridSecret: process.env.SENDGRID_WEBHOOK_SECRET,
    twilioSecret: process.env.TWILIO_WEBHOOK_SECRET,
  },

  // Monitoring
  monitoring: {
    datadogApiKey: process.env.DATADOG_API_KEY,
    sentryDsn: process.env.SENTRY_DSN,
  },

  // Operator Dashboard
  dashboard: {
    secretKey: process.env.DASHBOARD_SECRET_KEY,
    jwtSecret: process.env.JWT_SECRET,
  },
};
