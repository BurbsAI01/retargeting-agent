-- Visitors Table
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  phone VARCHAR,
  first_name VARCHAR,
  company_name VARCHAR,
  lifecycle_stage VARCHAR DEFAULT 'prospect',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  custom_metadata JSONB DEFAULT '{}'::jsonb,
  INDEX idx_email (email),
  INDEX idx_created_at (created_at)
);

-- Quotes Table
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  quote_details JSONB NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  conversion_status VARCHAR DEFAULT 'pending',
  quote_url VARCHAR UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_visitor_id (visitor_id),
  INDEX idx_conversion_status (conversion_status),
  INDEX idx_created_at (created_at)
);

-- Retargeting Campaigns Table
CREATE TABLE IF NOT EXISTS retargeting_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  campaign_status VARCHAR DEFAULT 'pending_approval',
  agent_recommendation JSONB NOT NULL,
  operator_modifications JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  approved_by VARCHAR,
  dispatched_at TIMESTAMP,
  INDEX idx_visitor_id (visitor_id),
  INDEX idx_campaign_status (campaign_status),
  INDEX idx_created_at (created_at)
);

-- Engagement Log Table
CREATE TABLE IF NOT EXISTS engagement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  channel VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  INDEX idx_visitor_id (visitor_id),
  INDEX idx_campaign_id (campaign_id),
  INDEX idx_channel (channel),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp)
);

-- Campaign Performance Aggregation Table
CREATE TABLE IF NOT EXISTS campaign_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID UNIQUE REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  channel VARCHAR NOT NULL,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5, 2),
  conversion_rate DECIMAL(5, 2),
  revenue_impact DECIMAL(12, 2),
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campaign_id (campaign_id),
  INDEX idx_channel (channel)
);

-- Operator Preferences Table
CREATE TABLE IF NOT EXISTS operator_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_email VARCHAR UNIQUE NOT NULL,
  max_discount_percent INTEGER DEFAULT 15,
  preferred_channels VARCHAR[] DEFAULT ARRAY['email', 'sms'],
  enable_personalized_offers BOOLEAN DEFAULT true,
  require_approval_auto BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_operator_email (operator_email)
);

-- Discount Codes Table
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR UNIQUE NOT NULL,
  campaign_id UUID REFERENCES retargeting_campaigns(id),
  visitor_id UUID REFERENCES visitors(id),
  discount_percent DECIMAL(5, 2) NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_is_used (is_used),
  INDEX idx_expires_at (expires_at)
);

-- Campaign Templates Table (for A/B testing)
CREATE TABLE IF NOT EXISTS campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  channel VARCHAR NOT NULL,
  subject_template VARCHAR,
  body_template TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_channel (channel),
  INDEX idx_is_active (is_active)
);

-- Create indexes
CREATE INDEX idx_visitors_email ON visitors(email);
CREATE INDEX idx_visitors_created_at ON visitors(created_at);
CREATE INDEX idx_quotes_visitor_id ON quotes(visitor_id);
CREATE INDEX idx_quotes_conversion_status ON quotes(conversion_status);
CREATE INDEX idx_campaigns_visitor_id ON retargeting_campaigns(visitor_id);
CREATE INDEX idx_campaigns_status ON retargeting_campaigns(campaign_status);
CREATE INDEX idx_engagement_visitor ON engagement_log(visitor_id);
CREATE INDEX idx_engagement_campaign ON engagement_log(campaign_id);
CREATE INDEX idx_engagement_channel ON engagement_log(channel);
CREATE INDEX idx_engagement_action ON engagement_log(action);
