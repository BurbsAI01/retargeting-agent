import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUIStore } from '../utils/store';
import { Menu, X, Zap, BarChart3, Settings } from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-white shadow"
      >
        {sidebarOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <Menu className="w-6 h-6" />
        )}
      </button>

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 bg-gray-900 text-white overflow-hidden flex flex-col`}
      >
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold">Retarget AI</h1>
          <p className="text-sm text-gray-400 mt-1">Operator Dashboard</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <Link
            to="/"
            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
              isActive('/')
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <Zap className="w-5 h-5" />
            <span>Campaign Queue</span>
          </Link>

          <Link
            to="/analytics"
            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
              isActive('/analytics')
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Analytics</span>
          </Link>

          <Link
            to="/settings"
            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
              isActive('/settings')
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-sm font-medium">System Status</p>
            <p className="text-xs text-green-400 mt-1">● Online</p>
          </div>
        </div>
      </aside>
    </>
  );
}
