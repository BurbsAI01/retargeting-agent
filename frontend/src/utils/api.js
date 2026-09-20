import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const campaignAPI = {
  // Get pending campaigns for approval
  getPendingCampaigns: () => api.get('/campaigns/pending-approval'),

  // Get single campaign details
  getCampaign: (campaignId) => api.get(`/campaigns/${campaignId}`),

  // Approve campaign
  approveCampaign: (campaignId, data) =>
    api.post(`/campaigns/${campaignId}/approve`, data),

  // Reject campaign
  rejectCampaign: (campaignId, data) =>
    api.post(`/campaigns/${campaignId}/reject`, data),

  // Get campaign performance
  getCampaignPerformance: (campaignId) =>
    api.get(`/campaigns/${campaignId}/performance`),

  // Get campaign history
  getCampaignHistory: (filters = {}) =>
    api.get('/campaigns/history', { params: filters }),
};

export const analyticsAPI = {
  // Get campaign analytics
  getCampaignAnalytics: (timeframe = '7d') =>
    api.get('/analytics/campaigns', { params: { timeframe } }),

  // Get channel performance
  getChannelPerformance: (timeframe = '7d') =>
    api.get('/analytics/channels', { params: { timeframe } }),

  // Get lead temperature breakdown
  getTemperatureBreakdown: () => api.get('/analytics/temperature'),
};

export const visitorAPI = {
  // Get visitor details
  getVisitor: (visitorId) => api.get(`/visitors/${visitorId}`),

  // Get visitor behavior
  getVisitorBehavior: (visitorId) =>
    api.get(`/visitors/${visitorId}/behavior`),

  // Get quote details
  getQuote: (quoteId) => api.get(`/quotes/${quoteId}`),
};

export default api;
