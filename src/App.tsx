/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Sidebar } from './components/Sidebar';
import { FleetDashboard } from './pages/FleetDashboard';
import { FleetAssets } from './pages/FleetAssets';
import { Compliance } from './pages/Compliance';
import { Settings } from './pages/Settings';
import { Vendors } from './pages/Vendors';
import { Contracts } from './pages/Contracts';
import { AIChat } from './components/AIChat';
import { AssetProvider } from './context/AssetContext';
import { VendorProvider } from './context/VendorContext';
import { ContractProvider } from './context/ContractContext';

export default function App() {
  useEffect(() => {
    const storedKey = localStorage.getItem('geminiApiKey');
    if (storedKey) {
      fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: storedKey })
      }).catch(console.error);
    }
  }, []);

  return (
    <AssetProvider>
      <VendorProvider>
        <ContractProvider>
          <Router>
            <div className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
              <Sidebar />
              <main className="flex-1 min-w-0 overflow-y-auto">
                <Routes>
                  <Route path="/" element={<FleetDashboard />} />
                  <Route path="/assets" element={<FleetAssets />} />
                  <Route path="/vendors" element={<Vendors />} />
                  <Route path="/contracts" element={<Contracts />} />
                  <Route path="/compliance" element={<Compliance />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </main>
              <Toaster position="top-right" richColors />
              <AIChat />
            </div>
          </Router>
        </ContractProvider>
      </VendorProvider>
    </AssetProvider>
  );
}
