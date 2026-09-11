import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Wrench, Users, Bell, ArrowLeft, Loader2 } from 'lucide-react';
import { useAssets } from '../context/AssetContext';
import { AssetList } from '../components/AssetList';
import { Asset } from '../types';
import { calculateDaysRemaining } from '../utils/compliance';
import { toast } from 'sonner';

export function FleetAssets() {
  const { assets, updateAsset } = useAssets();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAsset = assets.find(a => a.id === selectedAssetId) || null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renewModal, setRenewModal] = useState<{ isOpen: boolean; docType: 'roadTax' | 'insurance' | 'inspection' | null }>({ isOpen: false, docType: null });
  const [renewForm, setRenewForm] = useState({ startDate: '', endDate: '', attachmentName: '' });
  const [serviceModal, setServiceModal] = useState(false);
  const [serviceForm, setServiceForm] = useState<{
    date: string;
    type: 'PREVENTIVE' | 'CORRECTIVE';
    description: string;
    cost: number;
    odometer: number;
    attachmentName: string;
  }>({
    date: '',
    type: 'PREVENTIVE',
    description: '',
    cost: 0,
    odometer: 0,
    attachmentName: ''
  });

  const openRenewModal = (docType: 'roadTax' | 'insurance' | 'inspection') => {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const nextYearStr = nextYear.toISOString().split('T')[0];
    
    setRenewForm({ startDate: today, endDate: nextYearStr, attachmentName: '' });
    setRenewModal({ isOpen: true, docType });
  };

  const submitRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !renewModal.docType || isSubmitting) return;
    
    setIsSubmitting(true);
    const toastId = toast.loading('Renewing document...');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const todayStr = new Date().toISOString().split('T')[0];

      updateAsset(selectedAsset.id, {
        documents: {
          ...selectedAsset.documents,
          [renewModal.docType!]: {
            ...selectedAsset.documents[renewModal.docType!],
            startDate: renewForm.startDate,
            expiryDate: renewForm.endDate,
            attachmentName: renewForm.attachmentName,
            status: 'VALID',
            lastRenewedDate: todayStr,
            lastRenewedBy: 'Admin User'
          }
        }
      });
      setRenewModal({ isOpen: false, docType: null });
      toast.success('Document renewed successfully', { id: toastId });
    } catch (error) {
      toast.error('Failed to renew document', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openServiceModal = () => {
    if (!selectedAsset) return;
    const today = new Date().toISOString().split('T')[0];
    setServiceForm({
      date: today,
      type: 'PREVENTIVE',
      description: '',
      cost: 0,
      odometer: selectedAsset.maintenance.lastOdometer || 0,
      attachmentName: ''
    });
    setServiceModal(true);
  };

  const submitService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || isSubmitting) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Recording service...');

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      const serviceDate = new Date(serviceForm.date);
      const nextService = new Date(serviceDate.setMonth(serviceDate.getMonth() + 6));
      const nextServiceStr = nextService.toISOString().split('T')[0];

      updateAsset(selectedAsset.id, {
        maintenance: {
          ...selectedAsset.maintenance,
          lastServiceDate: serviceForm.date,
          nextServiceDate: nextServiceStr,
          lastOdometer: serviceForm.odometer,
          records: [
            {
              id: crypto.randomUUID(),
              date: serviceForm.date,
              type: serviceForm.type,
              description: serviceForm.description,
              cost: serviceForm.cost,
              odometer: serviceForm.odometer,
              status: 'COMPLETED',
              attachmentName: serviceForm.attachmentName
            },
            ...selectedAsset.maintenance.records
          ]
        }
      });
      setServiceModal(false);
      toast.success('Service recorded successfully', { id: toastId });
    } catch (error) {
      toast.error('Failed to record service', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          {selectedAsset && (
            <button 
              onClick={() => setSelectedAssetId(null)}
              className="p-2 text-gray-400 hover:text-[#1e3a8a] hover:bg-blue-50 rounded-full transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-[#1e3a8a]">
            {selectedAsset ? 'Asset Details' : 'Fleet Assets'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-gray-400 hover:text-gray-600 relative">
            <Bell className="w-5 h-5" />
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

      {!selectedAsset ? (
        <AssetList assets={assets} onSelectAsset={(asset) => setSelectedAssetId(asset.id)} />
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Compliance & History */}
          <div className="col-span-2 space-y-6">
          
          {/* Compliance Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-[#1e3a8a] font-bold mb-6">
              <FileText className="w-5 h-5" />
              Compliance Status
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Road Tax */}
              {selectedAsset.documents.roadTax && (() => {
                const days = calculateDaysRemaining(selectedAsset.documents.roadTax.expiryDate);
                const isWarning = days <= 30;
                return (
                  <div className={`p-4 border rounded-lg relative ${isWarning ? 'border-red-200 bg-red-50/30' : 'border-green-200 bg-green-50/30'}`}>
                    {isWarning ? <AlertTriangle className="w-5 h-5 text-red-500 absolute top-4 right-4" /> : <CheckCircle className="w-5 h-5 text-green-500 absolute top-4 right-4" />}
                    <div className="text-xs font-bold text-gray-500 mb-1 flex justify-between items-center">
                      <span>ROAD TAX</span>
                      <span className="text-[10px] font-normal text-gray-400">
                        Last: {selectedAsset.documents.roadTax.lastRenewedDate ? selectedAsset.documents.roadTax.lastRenewedDate.split('-').reverse().join('/') : 'N/A'} ({selectedAsset.documents.roadTax.lastRenewedBy || 'N/A'})
                      </span>
                    </div>
                    <div className={`text-xl font-bold mb-1 ${isWarning ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedAsset.documents.roadTax.expiryDate.split('-').reverse().join('/')}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className={`text-xs ${isWarning ? 'text-red-500' : 'text-green-600'}`}>
                        {days < 0 ? 'Expired' : `${days} days remaining`}
                      </div>
                      <button 
                        onClick={() => openRenewModal('roadTax')}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded"
                      >
                        Renew
                      </button>
                    </div>
                    {selectedAsset.documents.roadTax.attachmentName && (
                      <div className="mt-2 text-[10px] text-gray-500 truncate">
                        Attached: {selectedAsset.documents.roadTax.attachmentName}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Insurance */}
              {selectedAsset.documents.insurance && (() => {
                const days = calculateDaysRemaining(selectedAsset.documents.insurance.expiryDate);
                const isWarning = days <= 30;
                return (
                  <div className={`p-4 border rounded-lg relative ${isWarning ? 'border-red-200 bg-red-50/30' : 'border-green-200 bg-green-50/30'}`}>
                    {isWarning ? <AlertTriangle className="w-5 h-5 text-red-500 absolute top-4 right-4" /> : <CheckCircle className="w-5 h-5 text-green-500 absolute top-4 right-4" />}
                    <div className="text-xs font-bold text-gray-500 mb-1 flex justify-between items-center">
                      <span>INSURANCE</span>
                      <span className="text-[10px] font-normal text-gray-400">
                        Last: {selectedAsset.documents.insurance.lastRenewedDate ? selectedAsset.documents.insurance.lastRenewedDate.split('-').reverse().join('/') : 'N/A'} ({selectedAsset.documents.insurance.lastRenewedBy || 'N/A'})
                      </span>
                    </div>
                    <div className={`text-xl font-bold mb-1 ${isWarning ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedAsset.documents.insurance.expiryDate.split('-').reverse().join('/')}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className={`text-xs ${isWarning ? 'text-red-500' : 'text-green-600'}`}>
                        {days < 0 ? 'Expired' : `${days} days remaining`}
                      </div>
                      <button 
                        onClick={() => openRenewModal('insurance')}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded"
                      >
                        Renew
                      </button>
                    </div>
                    {selectedAsset.documents.insurance.attachmentName && (
                      <div className="mt-2 text-[10px] text-gray-500 truncate">
                        Attached: {selectedAsset.documents.insurance.attachmentName}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* PUSPAKOM */}
              {selectedAsset.documents.inspection && (() => {
                const days = calculateDaysRemaining(selectedAsset.documents.inspection.expiryDate);
                const isWarning = days <= 30;
                return (
                  <div className={`p-4 border rounded-lg relative ${isWarning ? 'border-red-200 bg-red-50/30' : 'border-green-200 bg-green-50/30'}`}>
                    {isWarning ? <AlertTriangle className="w-5 h-5 text-red-500 absolute top-4 right-4" /> : <CheckCircle className="w-5 h-5 text-green-500 absolute top-4 right-4" />}
                    <div className="text-xs font-bold text-gray-500 mb-1 flex justify-between items-center">
                      <span>PUSPAKOM / PMA</span>
                      <span className="text-[10px] font-normal text-gray-400">
                        Last: {selectedAsset.documents.inspection.lastRenewedDate ? selectedAsset.documents.inspection.lastRenewedDate.split('-').reverse().join('/') : 'N/A'} ({selectedAsset.documents.inspection.lastRenewedBy || 'N/A'})
                      </span>
                    </div>
                    <div className={`text-xl font-bold mb-1 ${isWarning ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedAsset.documents.inspection.expiryDate.split('-').reverse().join('/')}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className={`text-xs ${isWarning ? 'text-red-500' : 'text-green-600'}`}>
                        {days < 0 ? 'Expired' : `${days} days remaining`}
                      </div>
                      <button 
                        onClick={() => openRenewModal('inspection')}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded"
                      >
                        Renew
                      </button>
                    </div>
                    {selectedAsset.documents.inspection.attachmentName && (
                      <div className="mt-2 text-[10px] text-gray-500 truncate">
                        Attached: {selectedAsset.documents.inspection.attachmentName}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Next Service */}
              {(() => {
                const days = calculateDaysRemaining(selectedAsset.maintenance.nextServiceDate);
                const isWarning = days <= 30;
                return (
                  <div className={`p-4 border rounded-lg relative ${isWarning ? 'border-red-200 bg-red-50/30' : 'border-green-200 bg-green-50/30'}`}>
                    {isWarning ? <AlertTriangle className="w-5 h-5 text-red-500 absolute top-4 right-4" /> : <CheckCircle className="w-5 h-5 text-green-500 absolute top-4 right-4" />}
                    <div className="text-xs font-bold text-gray-500 mb-1 flex justify-between items-center">
                      <span>NEXT SERVICE</span>
                      <span className="text-[10px] font-normal text-gray-400">
                        Last: {selectedAsset.maintenance.lastServiceDate ? selectedAsset.maintenance.lastServiceDate.split('-').reverse().join('/') : 'N/A'}
                      </span>
                    </div>
                    <div className={`text-xl font-bold mb-1 ${isWarning ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedAsset.maintenance.nextServiceDate.split('-').reverse().join('/')}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className={`text-xs ${isWarning ? 'text-red-500' : 'text-green-600'}`}>
                        {days < 0 ? 'Overdue' : `${days} days remaining`}
                      </div>
                      <button 
                        onClick={openServiceModal}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded"
                      >
                        Record Service
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Maintenance History */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-[#1e3a8a] font-bold mb-6">
              <Wrench className="w-5 h-5" />
              Maintenance History
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Odometer</th>
                    <th className="px-4 py-3 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedAsset.maintenance.records.map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-gray-900">{record.date.split('-').reverse().join('/')}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${
                          record.type === 'PREVENTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {record.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-600">
                        <div>{record.description}</div>
                        {record.attachmentName && (
                          <div className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {record.attachmentName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-gray-600">{record.odometer?.toLocaleString()} km</td>
                      <td className="px-4 py-4 font-bold text-gray-900">RM {record.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - Details & Drivers */}
        <div className="space-y-6">
          {/* Asset Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedAsset.name}</h2>
                <div className="text-sm text-gray-500">{selectedAsset.registrationNumber}</div>
              </div>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
                {selectedAsset.category.replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">Brand</span>
                <span className="font-medium text-gray-900">{selectedAsset.brand}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">Model</span>
                <span className="font-medium text-gray-900">{selectedAsset.model}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">Year</span>
                <span className="font-medium text-gray-900">{selectedAsset.year}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Ownership</span>
                <span className="font-medium text-gray-900">{selectedAsset.ownership}</span>
              </div>
            </div>
          </div>

          {/* Assigned Drivers */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-[#1e3a8a] font-bold mb-4">
              <Users className="w-5 h-5" />
              Assigned Drivers
            </div>
            
            <div className="space-y-3">
              {selectedAsset.assignedDrivers.map(driver => (
                <div key={driver.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg bg-gray-50/50">
                  <img src={driver.image} alt={driver.name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <div className="font-bold text-sm text-gray-900">{driver.name}</div>
                    <div className="text-xs text-gray-500">{driver.licenseType} License â€¢ {driver.phone}</div>
                    <div className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> License Expiring Soon
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Maintenance Schedule */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-[#1e3a8a] font-bold mb-4">
              <Wrench className="w-5 h-5" />
              Maintenance
            </div>
            
            <div className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Last Service:</span>
                <span className="font-medium text-gray-900">01/12/2025</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Odometer:</span>
                <span className="font-medium text-gray-900">62,000 km</span>
              </div>
              
              <div className="pt-4 border-t border-gray-100">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-500">Next Service Due</span>
                  <span className="font-medium text-gray-900">87 days left</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '70%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Renew Modal */}
      {renewModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Renew {renewModal.docType?.replace(/([A-Z])/g, ' $1').toUpperCase()}
            </h3>
            <form onSubmit={submitRenew} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input 
                  type="date" 
                  required
                  value={renewForm.startDate}
                  onChange={e => setRenewForm({...renewForm, startDate: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Expiry)</label>
                <input 
                  type="date" 
                  required
                  value={renewForm.endDate}
                  onChange={e => setRenewForm({...renewForm, endDate: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supporting Document (Optional)</label>
                <input 
                  type="file" 
                  onChange={e => setRenewForm({...renewForm, attachmentName: e.target.files?.[0]?.name || ''})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setRenewModal({ isOpen: false, docType: null })}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors"
                >
                  Confirm Renewal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service Modal */}
      {serviceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Record Service
            </h3>
            <form onSubmit={submitService} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Date</label>
                <input 
                  type="date" 
                  required
                  value={serviceForm.date}
                  onChange={e => setServiceForm({...serviceForm, date: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select 
                  value={serviceForm.type}
                  onChange={e => setServiceForm({...serviceForm, type: e.target.value as 'PREVENTIVE' | 'CORRECTIVE'})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="PREVENTIVE">Preventive</option>
                  <option value="CORRECTIVE">Corrective</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Oil change, brake pads replacement"
                  value={serviceForm.description}
                  onChange={e => setServiceForm({...serviceForm, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Odometer (km)</label>
                  <input 
                    type="number" 
                    required
                    value={serviceForm.odometer}
                    onChange={e => setServiceForm({...serviceForm, odometer: Number(e.target.value)})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost ($)</label>
                  <input 
                    type="number" 
                    required
                    value={serviceForm.cost}
                    onChange={e => setServiceForm({...serviceForm, cost: Number(e.target.value)})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supporting Document (Optional)</label>
                <input 
                  type="file" 
                  onChange={e => setServiceForm({...serviceForm, attachmentName: e.target.files?.[0]?.name || ''})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setServiceModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
