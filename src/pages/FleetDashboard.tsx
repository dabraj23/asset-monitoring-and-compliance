import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, CheckCircle, Clock, XCircle, AlertTriangle, Wrench, FileText, Bell, Sparkles } from 'lucide-react';
import { useAssets } from '../context/AssetContext';
import { getDocumentStatus, calculateDaysRemaining, computeAssetStatus } from '../utils/compliance';
import { AIComplianceTaskModal } from '../components/AIComplianceTaskModal';

export function FleetDashboard() {
  const navigate = useNavigate();
  const { assets } = useAssets();
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [selectedComplianceTask, setSelectedComplianceTask] = useState<string | null>(null);

  // Calculate stats based on assets
  const totalFleet = assets.length;
  const compliant = assets.filter(a => computeAssetStatus(a) === 'COMPLIANT').length;
  const actionRequired = assets.filter(a => computeAssetStatus(a) === 'WARNING').length;
  const critical = assets.filter(a => computeAssetStatus(a) === 'NON_COMPLIANT').length;

  const { alerts, maintenanceStats, renewalStats } = useMemo(() => {
    const generatedAlerts: any[] = [];
    const mStats = { scheduled: 0, inWorkshop: 0, overdue: 0 };
    const rStats = { roadTax: 0, insurance: 0, driverLicense: 0 };

    assets.forEach(asset => {
      // Check documents
      Object.entries(asset.documents || {}).forEach(([docType, doc]) => {
        if (!doc) return;
        const document = doc as any;
        const status = getDocumentStatus(document.expiryDate);
        if (status === 'EXPIRED' || status === 'EXPIRING_SOON') {
          const formattedType = docType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          generatedAlerts.push({
            id: `${asset.id}-${docType}`,
            title: `${formattedType} ${status === 'EXPIRED' ? 'Expired' : 'Expiring Soon'}`,
            description: `${asset.name} (${asset.registrationNumber})`,
            location: asset.location?.name || 'Unknown Location',
            type: status === 'EXPIRED' ? 'critical' : 'warning',
            owner: 'Fleet Admin',
            date: document.expiryDate,
            icon: docType === 'insurance' ? FileText : Truck
          });

          if (status === 'EXPIRING_SOON') {
            if (docType === 'roadTax') rStats.roadTax++;
            if (docType === 'insurance') rStats.insurance++;
          }
        }
      });

      // Check drivers
      (asset.assignedDrivers || []).forEach(driver => {
        const status = getDocumentStatus(driver.licenseExpiry);
        if (status === 'EXPIRED' || status === 'EXPIRING_SOON') {
          generatedAlerts.push({
            id: `${asset.id}-driver-${driver.id}`,
            title: `License ${status === 'EXPIRED' ? 'Expired' : 'Expiring Soon'}`,
            description: `${driver.name} (Driver)`,
            location: asset.location?.name || 'Unknown Location',
            type: status === 'EXPIRED' ? 'critical' : 'warning',
            owner: 'HR / Fleet Admin',
            date: driver.licenseExpiry,
            icon: FileText
          });

          if (status === 'EXPIRING_SOON') {
            rStats.driverLicense++;
          }
        }
      });

      // Check maintenance
      if (asset.maintenance) {
        const daysToService = calculateDaysRemaining(asset.maintenance.nextServiceDate);
        if (daysToService < 0) {
          mStats.overdue++;
          generatedAlerts.push({
            id: `${asset.id}-maintenance`,
            title: `Maintenance Overdue`,
            description: `${asset.name} (${asset.registrationNumber})`,
            location: asset.location?.name || 'Unknown Location',
            type: 'critical',
            owner: 'Workshop Manager',
            date: asset.maintenance.nextServiceDate,
            icon: Wrench
          });
        } else if (daysToService <= 7) {
          mStats.scheduled++;
        }
      }
    });

    // Sort alerts: critical first, then by date
    generatedAlerts.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'critical' ? -1 : 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Deduplicate alerts by ID
    const uniqueAlerts = generatedAlerts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

    return { alerts: uniqueAlerts, maintenanceStats: mStats, renewalStats: rStats };
  }, [assets]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-[#1e3a8a]">Dashboard</h1>
        <div className="flex items-center gap-4">
          <button className="p-2 text-gray-400 hover:text-gray-600 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-bold text-gray-900">Admin User</div>
              <div className="text-xs text-gray-500">HQ Operations</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#1e3a8a] text-white flex items-center justify-center font-bold">
              AD
            </div>
          </div>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-500 mb-1">Total Assets</div>
            <div className="text-3xl font-bold text-gray-900">{totalFleet}</div>
            <div className="text-xs text-gray-400 mt-1">Across 4 Locations</div>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-500 mb-1">Compliant & Ready</div>
            <div className="text-3xl font-bold text-gray-900">{compliant}</div>
            <div className="text-xs text-gray-400 mt-1">Available for deployment</div>
          </div>
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center text-green-500">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-500 mb-1">Action Required</div>
            <div className="text-3xl font-bold text-gray-900">{actionRequired}</div>
            <div className="text-xs text-gray-400 mt-1">Due within 30 days</div>
          </div>
          <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center text-yellow-500">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-500 mb-1">Critical / Down</div>
            <div className="text-3xl font-bold text-gray-900">{critical}</div>
            <div className="text-xs text-gray-400 mt-1">Expired or Breakdown</div>
          </div>
          <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center text-red-500">
            <XCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left Column - Alerts */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 text-red-500 font-bold">
              <AlertTriangle className="w-5 h-5" />
              Compliance Alerts
            </div>
            {alerts.length > 5 && (
              <button 
                onClick={() => setShowAllAlerts(!showAllAlerts)} 
                className="text-sm text-blue-600 hover:underline"
              >
                {showAllAlerts ? 'View Less' : 'View All'}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No alerts at this time.</div>
            ) : (
              (showAllAlerts ? alerts : alerts.slice(0, 5)).map((alert) => (
                <div key={alert.id} className={`flex justify-between items-center p-4 border-l-4 rounded-r-lg ${
                  alert.type === 'critical' ? 'border-red-500 bg-red-50/50' : 'border-yellow-400 bg-yellow-50/50'
                }`}>
                  <div>
                    <div className="font-bold text-gray-900">
                      {alert.description}
                    </div>
                    <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                      <alert.icon className="w-4 h-4" /> {alert.location}
                    </div>
                    <button
                      onClick={() => setSelectedComplianceTask(`${alert.title} for ${alert.description}`)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#1e3a8a] bg-blue-50/80 px-2.5 py-1.5 rounded-md hover:bg-blue-100 transition-colors border border-blue-100"
                      title="Get AI Action Plan"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> AI Action Plan
                    </button>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${alert.type === 'critical' ? 'text-red-600' : 'text-yellow-600'}`}>
                      {alert.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Action Owner: {alert.owner}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column - Maintenance & Renewals */}
        <div className="space-y-6">
          {/* Maintenance Watch */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-[#1e3a8a] font-bold mb-6">
              <Wrench className="w-5 h-5" />
              Maintenance Watch
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Scheduled (Next 7 Days)</span>
                <span className="font-bold text-gray-900">{maintenanceStats.scheduled}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">In Workshop</span>
                <span className="font-bold text-yellow-600">{maintenanceStats.inWorkshop}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Overdue</span>
                <span className="font-bold text-red-600">{maintenanceStats.overdue}</span>
              </div>
              
              <button onClick={() => navigate('/assets')} className="w-full py-2 mt-4 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100">
                Schedule Service
              </button>
            </div>
          </div>

          {/* Renewals */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-[#1e3a8a] font-bold mb-6">
              <FileText className="w-5 h-5" />
              Renewals (This Month)
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border border-yellow-200 bg-yellow-50/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-yellow-100 text-yellow-700 flex items-center justify-center font-bold text-sm">{renewalStats.roadTax}</div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">Road Tax</div>
                    <div className="text-xs text-gray-500">Due Soon</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedComplianceTask('Renew Road Tax')} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Get AI Action Plan">
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button onClick={() => navigate('/assets')} className="text-sm font-bold text-yellow-600 hover:underline">Renew</button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">{renewalStats.insurance}</div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">Insurance</div>
                    <div className="text-xs text-gray-500">Due Soon</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedComplianceTask('Renew Insurance')} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Get AI Action Plan">
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button onClick={() => navigate('/assets')} className="text-sm font-bold text-blue-600 hover:underline">Renew</button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 border border-red-200 bg-red-50/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm">{renewalStats.driverLicense}</div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">Driver License</div>
                    <div className="text-xs text-gray-500">Expiring Soon</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedComplianceTask('Renew Driver License')} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Get AI Action Plan">
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button onClick={() => navigate('/assets')} className="text-sm font-bold text-red-600 hover:underline">View</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <AIComplianceTaskModal 
        isOpen={!!selectedComplianceTask} 
        onClose={() => setSelectedComplianceTask(null)} 
        complianceTask={selectedComplianceTask} 
      />
    </div>
  );
}
