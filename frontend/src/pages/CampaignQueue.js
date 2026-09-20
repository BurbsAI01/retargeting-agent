import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCampaignStore } from '../utils/store';
import { campaignAPI } from '../utils/api';
import { formatDistanceToNow } from 'date-fns';
import { ChevronRight, AlertCircle, TrendingUp } from 'lucide-react';

export default function CampaignQueue() {
  const campaigns = useCampaignStore((state) => state.campaigns);
  const setCampaigns = useCampaignStore((state) => state.setCampaigns);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadCampaigns();
    const interval = setInterval(loadCampaigns, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await campaignAPI.getPendingCampaigns();
      setCampaigns(response.data);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    if (filter === 'hot') return c.agent_recommendation?.lead_temperature === 'hot';
    if (filter === 'warm') return c.agent_recommendation?.lead_temperature === 'warm';
    if (filter === 'cold') return c.agent_recommendation?.lead_temperature === 'cold';
    return true;
  });

  const getTemperatureColor = (temp) => {
    switch (temp) {
      case 'hot':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'warm':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'cold':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
          <p className="text-sm font-medium text-gray-600">Hot Leads</p>
          <p className="text-3xl font-bold text-red-600 mt-2">
            {campaigns.filter((c) => c.agent_recommendation?.lead_temperature === 'hot').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500">
          <p className="text-sm font-medium text-gray-600">Warm Leads</p>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {campaigns.filter((c) => c.agent_recommendation?.lead_temperature === 'warm').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <p className="text-sm font-medium text-gray-600">Cold Leads</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {campaigns.filter((c) => c.agent_recommendation?.lead_temperature === 'cold').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <p className="text-sm font-medium text-gray-600">Total Pending</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{campaigns.length}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex space-x-2">
        {['all', 'hot', 'warm', 'cold'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Campaign List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading campaigns...</div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No campaigns pending approval</p>
            <p className="text-sm text-gray-500 mt-1">New campaigns will appear here</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredCampaigns.map((campaign) => {
              const temp = campaign.agent_recommendation?.lead_temperature || 'unknown';
              const discount = campaign.agent_recommendation?.suggested_discount_percent || 0;

              return (
                <Link
                  key={campaign.id}
                  to={`/campaigns/${campaign.id}`}
                  className="p-6 hover:bg-gray-50 transition flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                          {campaign.first_name} {campaign.last_name || ''} - {campaign.company_name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">{campaign.email}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium border ${getTemperatureColor(temp)}`}
                      >
                        {temp.toUpperCase()}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center space-x-6 text-sm">
                      <div>
                        <p className="text-gray-500">Suggested Discount</p>
                        <p className="font-semibold text-gray-900">{discount}%</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Quote Amount</p>
                        <p className="font-semibold text-gray-900">
                          ${campaign.quote_details?.base_price?.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Created</p>
                        <p className="font-semibold text-gray-900">
                          {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-blue-600 ml-4" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
