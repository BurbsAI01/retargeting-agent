import create from 'zustand';

export const useCampaignStore = create((set) => ({
  campaigns: [],
  selectedCampaign: null,
  loading: false,
  error: null,

  setCampaigns: (campaigns) => set({ campaigns }),
  setSelectedCampaign: (campaign) => set({ selectedCampaign: campaign }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  addCampaign: (campaign) =>
    set((state) => ({
      campaigns: [campaign, ...state.campaigns],
    })),

  updateCampaign: (campaignId, updates) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId ? { ...c, ...updates } : c
      ),
      selectedCampaign:
        state.selectedCampaign?.id === campaignId
          ? { ...state.selectedCampaign, ...updates }
          : state.selectedCampaign,
    })),

  removeCampaign: (campaignId) =>
    set((state) => ({
      campaigns: state.campaigns.filter((c) => c.id !== campaignId),
      selectedCampaign:
        state.selectedCampaign?.id === campaignId
          ? null
          : state.selectedCampaign,
    })),

  clearError: () => set({ error: null }),
}));

export const useUIStore = create((set) => ({
  sidebarOpen: true,
  darkMode: false,
  activeTab: 'queue',

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDarkMode: (dark) => set({ darkMode: dark }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

export const useAnalyticsStore = create((set) => ({
  campaignMetrics: null,
  channelPerformance: null,
  temperatureBreakdown: null,
  loading: false,

  setCampaignMetrics: (metrics) => set({ campaignMetrics: metrics }),
  setChannelPerformance: (performance) =>
    set({ channelPerformance: performance }),
  setTemperatureBreakdown: (breakdown) =>
    set({ temperatureBreakdown: breakdown }),
  setLoading: (loading) => set({ loading }),
}));
