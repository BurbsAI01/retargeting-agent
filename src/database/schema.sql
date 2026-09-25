-- Visitors Table
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  phone VARCHAR,
  first_name VARCHAR,
  company_name VARCHAR,
  visitor_type VARCHAR DEFAULT 'website_visitor',
  lifecycle_stage VARCHAR DEFAULT 'prospect',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  custom_metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_visitors_email ON visitors(email);
CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at);

-- Quotes Table
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  quote_details JSONB NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  conversion_status VARCHAR DEFAULT 'pending',
  quote_url VARCHAR UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotes_visitor_id ON quotes(visitor_id);
CREATE INDEX IF NOT EXISTS idx_quotes_conversion_status ON quotes(conversion_status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);

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
  dispatched_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_visitor_id ON retargeting_campaigns(visitor_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON retargeting_campaigns(campaign_status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON retargeting_campaigns(created_at);

-- Engagement Log Table
CREATE TABLE IF NOT EXISTS engagement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  channel VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_engagement_visitor_id ON engagement_log(visitor_id);
CREATE INDEX IF NOT EXISTS idx_engagement_campaign_id ON engagement_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_engagement_channel ON engagement_log(channel);

-- Operator Approvals Table
CREATE TABLE IF NOT EXISTS operator_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  operator_email VARCHAR NOT NULL,
  discount_percent DECIMAL(5, 2),
  channels VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
  incentive VARCHAR DEFAULT 'discount_percent',
  approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operator_approvals_campaign ON operator_approvals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_operator_approvals_email ON operator_approvals(operator_email);

-- Discount Codes Table
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  code VARCHAR UNIQUE NOT NULL,
  discount_percent DECIMAL(5, 2) NOT NULL,
  max_uses INT,
  uses_count INT DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_campaign ON discount_codes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);

-- Behavior Events Table
CREATE TABLE IF NOT EXISTS behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  event_type VARCHAR NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_behavior_visitor_id ON behavior_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_behavior_event_type ON behavior_events(event_type);

-- Quote Recovery Links Table
CREATE TABLE IF NOT EXISTS quote_recovery_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  recovery_token VARCHAR UNIQUE NOT NULL,
  recovery_url VARCHAR NOT NULL,
  includes_discount BOOLEAN DEFAULT true,
  discount_percent DECIMAL(5, 2),
  expires_at TIMESTAMP NOT NULL,
  first_visited_at TIMESTAMP,
  converted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recovery_links_campaign ON quote_recovery_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recovery_links_token ON quote_recovery_links(recovery_token);

-- Campaign Performance Table
CREATE TABLE IF NOT EXISTS campaign_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  channel VARCHAR NOT NULL,
  total_sent INT DEFAULT 0,
  total_delivered INT DEFAULT 0,
  total_opened INT DEFAULT 0,
  total_clicked INT DEFAULT 0,
  total_converted INT DEFAULT 0,
  revenue_impact DECIMAL(12, 2) DEFAULT 0,
  conversion_rate DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_performance_campaign ON campaign_performance(campaign_id);

-- Dispatch History Table
CREATE TABLE IF NOT EXISTS dispatch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES retargeting_campaigns(id) ON DELETE CASCADE,
  channel VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending',
  message_count INT DEFAULT 0,
  successful_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  error_log JSONB DEFAULT '{}'::jsonb,
  dispatched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dispatch_campaign ON dispatch_history(campaign_id);

-- Beta Customers Table
CREATE TABLE IF NOT EXISTS beta_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  company_name VARCHAR,
  contact_person VARCHAR,
  phone VARCHAR,
  tier VARCHAR DEFAULT 'beta',
  status VARCHAR DEFAULT 'pending_signature',
  agreement_signed_at TIMESTAMP,
  agreement_version VARCHAR,
  signed_by_name VARCHAR,
  signed_by_email VARCHAR,
  signature_token VARCHAR UNIQUE,
  signature_token_expires_at TIMESTAMP,
  api_key_id UUID,
  rate_limit INT DEFAULT 1000,
  allowed_channels VARCHAR[] DEFAULT ARRAY['email']::VARCHAR[],
  onboarded_at TIMESTAMP,
  notes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_beta_customers_status ON beta_customers(status);
CREATE INDEX IF NOT EXISTS idx_beta_customers_email ON beta_customers(email);
CREATE INDEX IF NOT EXISTS idx_beta_customers_signature_token ON beta_customers(signature_token);

-- API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_customer_id UUID REFERENCES beta_customers(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  key_prefix VARCHAR,
  key_hash VARCHAR UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_customer ON api_keys(beta_customer_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Set up row-level security (optional, for multi-tenant support)
ALTER TABLE visitors OWNER TO postgres;
ALTER TABLE quotes OWNER TO postgres;
ALTER TABLE retargeting_campaigns OWNER TO postgres;
ALTER TABLE engagement_log OWNER TO postgres;
ALTER TABLE operator_approvals OWNER TO postgres;
ALTER TABLE discount_codes OWNER TO postgres;
ALTER TABLE behavior_events OWNER TO postgres;
ALTER TABLE quote_recovery_links OWNER TO postgres;
ALTER TABLE campaign_performance OWNER TO postgres;
ALTER TABLE dispatch_history OWNER TO postgres;
ALTER TABLE beta_customers OWNER TO postgres;
ALTER TABLE api_keys OWNER TO postgres;
