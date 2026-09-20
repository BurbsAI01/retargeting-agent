import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { campaignAPI, visitorAPI } from '../utils/api';
import { useCampaignStore } from '../utils/store';
import {
  ChevronLeft,
  Copy,
  Heart,
  Mail,
  MessageSquare,
  Share2,
  Gift,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [visitorBehavior, setVisitorBehavior] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('variant_a');
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [discountModification, setDiscountModification] = useState(null);
  const [selectedIncentive, setSelectedIncentive] = useState(null);
  const [notes, setNotes] = useState('');
  const [copyOverrides, setCopyOverrides] = useState({});

  useEffect(() => {
    loadCampaign();
  }, [id]);

  const loadCampaign = async () => {
    try {
      setLoading(true);
      const response = await campaignAPI.getCampaign(id);
      const data = response.data;
      setCampaign(data);
      setSelectedChannels(data.agent_recommendation?.channels || []);
      setDiscountModification(data.agent_recommendation?.suggested_discount_percent);

      // Load visitor behavior
      if (data.visitor_id) {
        try {
          const behaviorResponse = await visitorAPI.getVisitorBehavior(data.visitor_id);
          setVisitorBehavior(behaviorResponse.data);
        } catch (error) {
          console.log('Behavior data not available');
        }
      }
    } catch (error) {
      console.error('Error loading campaign:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!discountModification && selectedChannels.length === 0) {
      alert('Please make selections before approving');
      return;
    }

    try {
      setSubmitting(true);
      await campaignAPI.approveCampaign(id, {
        operator_email: 'operator@company.com', // TODO: Get from auth
        discount_percent: discountModification,
        channels: selectedChannels,
        copy_overrides: copyOverrides,
        incentive: selectedIncentive,
        notes,
      });

      useCampaignStore.getState().removeCampaign(id);
      navigate('/');
    } catch (error) {
      console.error('Error approving campaign:', error);
      alert('Failed to approve campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!notes.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      setSubmitting(true);
      await campaignAPI.rejectCampaign(id, {
        operator_email: 'operator@company.com',
        reason: notes,
      });

      useCampaignStore.getState().removeCampaign(id);
      navigate('/');
    } catch (error) {
      console.error('Error rejecting campaign:', error);
      alert('Failed to reject campaign');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 bg-blue-100 rounded-full animate-pulse mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="mt-4 text-gray-600 font-medium">Campaign not found</p>
        </div>
      </div>
    );
  }

  const rec = campaign.agent_recommendation || {};
  const variants = rec.copy_variants || {};
  const selectedCopyVariant = variants[selectedVariant] || {};

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-medium"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Queue</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Visitor Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {campaign.first_name} {campaign.last_name || ''} ({campaign.company_name})
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Email</p>
                <p className="text-gray-900 mt-1">{campaign.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Phone</p>
                <p className="text-gray-900 mt-1">{campaign.phone || 'N/A'}</p>
              </div>
            </div>

            {/* Behavior Insights */}
            {rec.behavior_insights && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-600 mb-3">Behavior Signals</p>
                <div className="flex flex-wrap gap-2">
                  {rec.behavior_insights.price_sensitivity && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                      Price Sensitive
                    </span>
                  )}
                  {rec.behavior_insights.engagement_level && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                      {rec.behavior_insights.engagement_level} Engagement
                    </span>
                  )}
                  {rec.behavior_insights.feature_interest?.map((feature) => (
                    <span
                      key={feature}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm"
                    >
                      Interested: {feature}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Copy Variants */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Copy Variants (A/B Test)</h3>

            {/* Variant Selector */}
            <div className="flex space-x-2 mb-6">
              {Object.keys(variants).map((variant) => (
                <button
                  key={variant}
                  onClick={() => setSelectedVariant(variant)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    selectedVariant === variant
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {variant.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>

            {/* Email Preview */}
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <Mail className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-gray-900">Email</h4>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div>
                  <p className="text-xs font-medium text-gray-600">Subject</p>
                  <p className="text-gray-900 font-medium">
                    {selectedCopyVariant.email_subject || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Body</p>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">
                    {selectedCopyVariant.email_body || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">CTA</p>
                  <p className="text-gray-700 text-sm">{selectedCopyVariant.email_cta || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* SMS Preview */}
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <MessageSquare className="w-5 h-5 text-green-600" />
                <h4 className="font-semibold text-gray-900">SMS Message</h4>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 text-sm">{selectedCopyVariant.sms_message || 'N/A'}</p>
              </div>
            </div>

            {/* Ad Preview */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <Share2 className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-gray-900">Social Ad</h4>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div>
                  <p className="text-xs font-medium text-gray-600">Headline</p>
                  <p className="text-gray-900 font-medium">{selectedCopyVariant.ad_headline || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Description</p>
                  <p className="text-gray-700 text-sm">{selectedCopyVariant.ad_description || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="space-y-6">
          {/* Lead Temperature */}
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Lead Temperature</p>
            <div className="flex items-center space-x-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                  rec.lead_temperature === 'hot'
                    ? 'bg-red-500'
                    : rec.lead_temperature === 'warm'
                    ? 'bg-orange-500'
                    : 'bg-blue-500'
                }`}
              >
                {rec.temperature_score || 0}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {rec.lead_temperature?.toUpperCase()}
                </p>
                <p className="text-xs text-gray-500">{rec.reasoning}</p>
              </div>
            </div>
          </div>

          {/* Discount Modification */}
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-3">Discount %</p>
            <input
              type="number"
              min="0"
              max="100"
              value={discountModification || 0}
              onChange={(e) => setDiscountModification(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              Original Price: ${campaign.quote_details?.base_price?.toLocaleString()}
            </p>
            <p className="text-sm font-semibold text-green-600 mt-2">
              New Price: ${Math.round(campaign.quote_details?.base_price * (1 - discountModification / 100)).toLocaleString()}
            </p>
          </div>

          {/* Channel Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-3">Channels</p>
            <div className="space-y-2">
              {['email', 'sms', 'facebook', 'google_ads', 'linkedin'].map((channel) => (
                <label key={channel} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(channel)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedChannels([...selectedChannels, channel]);
                      } else {
                        setSelectedChannels(selectedChannels.filter((c) => c !== channel));
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 capitalize">{channel.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Recommended Incentives */}
          {rec.recommended_incentives && rec.recommended_incentives.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm font-medium text-gray-600 mb-3 flex items-center space-x-2">
                <Gift className="w-4 h-4" />
                <span>Incentives</span>
              </p>
              <div className="space-y-2">
                {rec.recommended_incentives.map((incentive, idx) => (
                  <label
                    key={idx}
                    className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="incentive"
                      checked={selectedIncentive === incentive.incentive_type}
                      onChange={() => setSelectedIncentive(incentive.incentive_type)}
                      className="w-4 h-4 mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{incentive.display_name}</p>
                      <p className="text-xs text-gray-500 mt-1">{incentive.reasoning}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-3">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes or context about this campaign..."
              rows="4"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition flex items-center justify-center space-x-2"
            >
              <Check className="w-5 h-5" />
              <span>Approve Campaign</span>
            </button>
            <button
              onClick={handleReject}
              disabled={submitting}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition flex items-center justify-center space-x-2"
            >
              <X className="w-5 h-5" />
              <span>Reject Campaign</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
