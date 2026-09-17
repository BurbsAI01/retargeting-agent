# Retargeting Agent

An AI-powered multi-channel retargeting system that automatically identifies unconverted website visitors, generates personalized outreach campaigns, and manages operator-controlled discount approvals across email, SMS, and social platforms.

## Overview

The Retargeting Agent orchestrates the following workflow:

1. **Event Detection** - Visitor views quote but doesn't convert
2. **AI Segmentation** - Agent classifies lead temperature (hot/warm/cold)
3. **Personalization** - Generate channel-specific copy using Claude AI
4. **Operator Review** - Dashboard for human approval and discount negotiation
5. **Multi-Channel Dispatch** - Send campaigns in parallel across email, SMS, social ads
6. **Engagement Tracking** - Monitor opens, clicks, conversions via webhooks
7. **Feedback Loop** - Analytics drive future campaign optimization

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker & Docker Compose (optional)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/burbsai01/retargeting-agent.git
   cd retargeting-agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start services with Docker Compose**
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

6. **Start the application**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design, data flow, and component descriptions.

## API Endpoints

### Webhooks

#### `POST /webhooks/visitor-event`
Receive visitor events (quote generated, no conversion)

```json
{
  "visitorId": "uuid",
  "email": "visitor@example.com",
  "phone": "+1234567890",
  "company": "Acme Corp",
  "event_type": "quote_generated",
  "quote_data": {
    "service": "Voice AI Setup",
    "duration": "3 months",
    "base_price": 5000,
    "quote_url": "https://example.com/quotes/abc123",
    "converted": false
  }
}
```

### Campaigns

#### `GET /campaigns/pending-approval`
Get campaigns waiting for operator approval

#### `POST /campaigns/:campaignId/approve`
Operator approves campaign (with optional modifications)

#### `POST /campaigns/:campaignId/reject`
Operator rejects campaign

## Environment Variables

See `.env.example` for all available configuration options.

## Project Structure

```
retargeting-agent/
├── src/
│   ├── index.js                 # Main Express app & job processing
│   ├── agent/
│   │   └── RetargetingAgent.js  # AI orchestration logic
│   ├── channels/
│   │   ├── EmailChannel.js      # SendGrid integration
│   │   ├── SMSChannel.js        # Twilio integration
│   │   ├── FacebookChannel.js   # Facebook Ads API
│   │   ├── GoogleAdsChannel.js  # Google Ads API
│   │   └── LinkedInChannel.js   # LinkedIn integration
│   ├── database/
│   │   ├── schema.sql           # Database schema
│   │   └── migrations/
│   ├── webhooks/
│   │   ├── sendgrid.js
│   │   ├── twilio.js
│   │   └── facebook.js
│   └── dashboard/
│       └── OperatorAPI.js
├── tests/
├── docker-compose.yml
├── .env.example
└── package.json
```

## Development

```bash
npm test
npm run lint
npm run format
npm run db:migrate
```

## Key Features

- **AI-Powered Segmentation**: Lead temperature scoring (hot/warm/cold)
- **Personalized Copy**: Claude-generated channel-specific messaging
- **Operator Control**: Human approval required for discount offers
- **Multi-Channel**: Email, SMS, Facebook, Google Ads, LinkedIn
- **Engagement Tracking**: Webhooks for opens, clicks, conversions
- **Discount Management**: Configurable rules with audit trail
- **Privacy Compliant**: GDPR, CCPA, CAN-SPAM ready

## License

MIT
