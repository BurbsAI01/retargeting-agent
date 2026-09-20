import React, { useState, useEffect } from 'react';
import { analyticsAPI } from '../utils/api';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function Analytics() {
  const [metrics, setMetrics] = useState(null);
  const [channelPerf, setChannelPerf] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [metricsRes, channelRes] = await Promise.all([
        analyticsAPI.getCampaignAnalytics(),
        analyticsAPI.getChannelPerformance(),
      ]);
      setMetrics(metricsRes.data);
      setChannelPerf(channelRes.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-600">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Campaigns This Month</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {metrics?.total_campaigns || 0}
          </p>
          <p className="text-xs text-green-600 mt-2 flex items-center space-x-1">
            <TrendingUp className="w-4 h-4" />
            <span>12% increase</span>
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Avg Engagement Rate</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {metrics?.avg_engagement_rate || '0'}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {metrics?.conversion_rate || '0'}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Avg Deal Value</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            ${metrics?.avg_deal_value || 0}
          </p>
        </div>
      </div>

      {/* Channel Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Channel Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Channel</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Sent</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Opened</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Clicked</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Converted</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              {channelPerf?.channels?.map((channel) => (
                <tr key={channel.name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">
                    {channel.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{channel.sent}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {channel.opened} ({channel.open_rate}%)
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {channel.clicked} ({channel.click_rate}%)
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{channel.converted}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-green-600">
                    {channel.conversion_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Performing Copy Variants */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Top Copy Variants</h2>
        <div className="space-y-4">
          {metrics?.top_variants?.map((variant, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{variant.name}</p>
                <p className="text-sm text-gray-500 mt-1">{variant.description}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-600">{variant.conversion_rate}%</p>
                <p className="text-xs text-gray-500">Conversion Rate</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
