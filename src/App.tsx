/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
import { AuthProvider, useAuth } from './context/AuthContext';
import { SignIn } from './pages/SignIn';
import { EntityProvider } from './context/EntityContext';
import { WorkflowStudio } from './pages/WorkflowStudio';
import { Drivers } from './pages/Drivers';
import { MyWork } from './pages/MyWork';
import { Executive } from './pages/Executive';
import { Intake } from './pages/Intake';
import { AssetDocuments } from './pages/AssetDocuments';

function Workspace() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Opening secure workspace…</div>;
  if (!user) return <SignIn />;
  return (
    <EntityProvider><AssetProvider>
      <VendorProvider>
        <ContractProvider>
          <Router>
            <div className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
              <Sidebar />
              <main className="min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0">
                <Routes>
                  <Route path="/" element={user.role === 'EXECUTIVE' ? <Executive /> : <FleetDashboard />} />
                  <Route path="/assets" element={<FleetAssets />} />
                  <Route path="/drivers" element={<Drivers />} />
                  <Route path="/my-work" element={<MyWork />} />
                  <Route path="/executive" element={<Executive />} />
                  <Route path="/intake" element={<Intake />} />
                  <Route path="/asset-documents" element={<AssetDocuments />} />
                  <Route path="/vendors" element={<Vendors />} />
                  <Route path="/contracts" element={<Contracts />} />
                  <Route path="/compliance" element={<Compliance />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/workflow-studio" element={<WorkflowStudio />} />
                </Routes>
              </main>
              <Toaster position="top-right" richColors />
              <AIChat />
            </div>
          </Router>
        </ContractProvider>
      </VendorProvider>
    </AssetProvider></EntityProvider>
  );
}

export default function App() { return <AuthProvider><Workspace /></AuthProvider>; }
