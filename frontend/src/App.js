import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useUIStore } from './utils/store';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CampaignQueue from './pages/CampaignQueue';
import CampaignDetail from './pages/CampaignDetail';
import Analytics from './pages/Analytics';
import './styles/App.css';

export default function App() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const [loading, setLoading] = useState(false);

  return (
    <Router>
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <Header />

          {/* Page Content */}
          <main className="flex-1 overflow-auto p-8">
            <Routes>
              <Route path="/" element={<CampaignQueue />} />
              <Route path="/campaigns/:id" element={<CampaignDetail />} />
              <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}
