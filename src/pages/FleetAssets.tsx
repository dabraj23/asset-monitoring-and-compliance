import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Wrench, Users, Bell, ArrowLeft, Loader2, Plus, Upload } from 'lucide-react';
import { useAssets } from '../context/AssetContext';
import { Asset } from '../types';
import { calculateDaysRemaining } from '../utils/compliance';
import { toast } from 'sonner';
import { AssetRegisterStart } from '../components/AssetRegisterStart';
import { AssetCreationWizard } from '../components/AssetCreationWizard';
import { BulkAssetImportModal } from '../components/BulkAssetImportModal';

export function FleetAssets() {
  const { assets, isLoading, createAsset, createAssets, updateAsset } = useAssets();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAsset = assets.find(a => a.id === selectedAssetId) || null;
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allocationModal, setAllocationModal] = useState(false);
  const [allocationForm, setAllocationForm] = useState({
    effectiveDate: '',
    driverName: '',
    licenseNumber: '',
    licenseClass: '',
    licenseExpiry: '',
    reason: '',
  });
  const [claimModal, setClaimModal] = useState(false);
  const [claimForm, setClaimForm] = useState<{
    claimNumber: string;
    incidentDate: string;
    description: string;
    amount: number;
    insurer: string;
    status: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SETTLED';
  }>({
    claimNumber: '',
    incidentDate: '',
    description: '',
    amount: 0,
    insurer: '',
    status: 'OPEN',
  });
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

      await updateAsset(selectedAsset.id, {
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

      await updateAsset(selectedAsset.id, {
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

  const openAllocationModal = () => {
    const currentDriver = selectedAsset?.assignedDrivers[0];
    setAllocationForm({
      effectiveDate: new Date().toISOString().slice(0, 10),
      driverName: '',
      licenseNumber: '',
      licenseClass: '',
      licenseExpiry: '',
      reason: currentDriver ? 'Driver reassignment' : 'Initial allocation',
    });
    setAllocationModal(true);
  };

  const submitAllocation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAsset || isSubmitting) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Updating driver allocation...');
    try {
      const driver = {
        id: crypto.randomUUID(),
        name: allocationForm.driverName.trim(),
        licenseNumber: allocationForm.licenseNumber.trim(),
        licenseType: allocationForm.licenseClass.trim(),
        licenseExpiry: allocationForm.licenseExpiry,
        phone: '',
        status: 'ACTIVE' as const,
        image: '',
      };
      const existingHistory = selectedAsset.allocationHistory || [];
      const endedHistory = existingHistory.map(record => record.status === 'ACTIVE'
        ? { ...record, assignedTo: allocationForm.effectiveDate, status: 'ENDED' as const, reason: allocationForm.reason.trim() || record.reason }
        : record);
      const currentDriver = selectedAsset.assignedDrivers[0];
      const historyWithPreviousDriver = currentDriver && !existingHistory.some(record => record.status === 'ACTIVE')
        ? [...endedHistory, {
            id: crypto.randomUUID(),
            driverId: currentDriver.id,
            driverName: currentDriver.name,
            licenseNumber: currentDriver.licenseNumber,
            assignedFrom: '',
            assignedTo: allocationForm.effectiveDate,
            reason: allocationForm.reason.trim(),
            status: 'ENDED' as const,
          }]
        : endedHistory;

      await updateAsset(selectedAsset.id, {
        assignedDrivers: [driver],
        allocationHistory: [
          ...historyWithPreviousDriver,
          {
            id: crypto.randomUUID(),
            driverId: driver.id,
            driverName: driver.name,
            licenseNumber: driver.licenseNumber,
            assignedFrom: allocationForm.effectiveDate,
            reason: allocationForm.reason.trim(),
            status: 'ACTIVE',
          },
        ],
      });
      setAllocationModal(false);
      toast.success(currentDriver ? 'Driver changed successfully' : 'Driver assigned successfully', { id: toastId });
    } catch {
      toast.error('Unable to update driver allocation', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openClaimModal = () => {
    setClaimForm({
      claimNumber: '',
      incidentDate: new Date().toISOString().slice(0, 10),
      description: '',
      amount: 0,
      insurer: '',
      status: 'OPEN',
    });
    setClaimModal(true);
  };

  const submitClaim = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAsset || isSubmitting) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Recording claim...');
    try {
      await updateAsset(selectedAsset.id, {
        claims: [
          {
            id: crypto.randomUUID(),
            claimNumber: claimForm.claimNumber.trim(),
            incidentDate: claimForm.incidentDate,
            description: claimForm.description.trim(),
            amount: claimForm.amount,
            insurer: claimForm.insurer.trim(),
            status: claimForm.status,
          },
          ...(selectedAsset.claims || []),
        ],
      });
      setClaimModal(false);
      toast.success('Claim recorded successfully', { id: toastId });
    } catch {
      toast.error('Unable to record claim', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
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
            {selectedAsset ? 'Asset Details' : 'Asset Management'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {!selectedAsset && (
            <div className="hidden items-center gap-2 sm:flex">
              <button type="button" onClick={() => setShowBulkImport(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50">
                <Upload className="h-4 w-4" /> Bulk upload
              </button>
              <button type="button" onClick={() => setShowCreateWizard(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#1e3a8a] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-900">
                <Plus className="h-4 w-4" /> Add asset
              </button>
            </div>
          )}
          <button className="p-2 text-gray-400 hover:text-gray-600 relative">
            <Bell className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
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
        <>
          <div className="flex gap-2 sm:hidden">
            <button type="button" onClick={() => setShowBulkImport(true)} className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-700"><Upload className="mr-2 inline h-4 w-4" />Bulk upload</button>
            <button type="button" onClick={() => setShowCreateWizard(true)} className="flex-1 rounded-lg bg-[#1e3a8a] px-3 py-2.5 text-sm font-bold text-white"><Plus className="mr-2 inline h-4 w-4" />Add asset</button>
          </div>
          <AssetRegisterStart
            assets={assets}
            isLoading={isLoading}
            onAddAsset={() => setShowCreateWizard(true)}
            onBulkUpload={() => setShowBulkImport(true)}
            onSelectAsset={(asset) => setSelectedAssetId(asset.id)}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left Column - Compliance & History */}
          <div className="space-y-6 xl:col-span-2">
          
          {/* Compliance Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-[#1e3a8a] font-bold mb-6">
              <FileText className="w-5 h-5" />
              Compliance Status
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-[#1e3a8a]">
                <Wrench className="w-5 h-5" />
                Maintenance History
              </div>
              <div className="text-sm font-bold text-gray-700">
                Total cost: RM {selectedAsset.maintenance.records.reduce((total, record) => total + record.cost, 0).toLocaleString()}
              </div>
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
                  {!selectedAsset.maintenance.records.length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No maintenance records yet.</td></tr>
                  )}
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

          {/* Claims */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-[#1e3a8a]">
                <FileText className="h-5 w-5" />
                Claims
              </div>
              <button type="button" onClick={openClaimModal} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 hover:bg-blue-100">
                <Plus className="h-4 w-4" /> Add claim
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-gray-100 text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-3 font-medium">Incident</th><th className="px-4 py-3 font-medium">Claim</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!(selectedAsset.claims || []).length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No claims recorded for this asset.</td></tr>
                  )}
                  {(selectedAsset.claims || []).map(claim => (
                    <tr key={claim.id}>
                      <td className="px-4 py-4 text-gray-700">{claim.incidentDate.split('-').reverse().join('/')}</td>
                      <td className="px-4 py-4"><div className="font-bold text-gray-900">{claim.claimNumber}</div><div className="text-xs text-gray-500">{claim.insurer || 'No insurer recorded'}</div></td>
                      <td className="max-w-xs px-4 py-4 text-gray-600">{claim.description}</td>
                      <td className="px-4 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{claim.status}</span></td>
                      <td className="px-4 py-4 text-right font-bold text-gray-900">RM {claim.amount.toLocaleString()}</td>
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-[#1e3a8a]">
                <Users className="w-5 h-5" />
                Current Driver
              </div>
              <button type="button" onClick={openAllocationModal} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100">
                {selectedAsset.assignedDrivers.length ? 'Change driver' : 'Assign driver'}
              </button>
            </div>
            
            <div className="space-y-3">
              {!selectedAsset.assignedDrivers.length && <div className="rounded-lg border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">This vehicle is currently unassigned.</div>}
              {selectedAsset.assignedDrivers.map(driver => {
                const licenceDays = driver.licenseExpiry ? calculateDaysRemaining(driver.licenseExpiry) : Number.NEGATIVE_INFINITY;
                const licenceLabel = licenceDays < 0 ? 'Licence expired' : licenceDays <= 30 ? `Licence expires in ${licenceDays} days` : `Licence valid until ${driver.licenseExpiry.split('-').reverse().join('/')}`;
                const licenceStyle = licenceDays < 0 ? 'text-red-600' : licenceDays <= 30 ? 'text-yellow-600' : 'text-green-700';
                return (
                  <div key={driver.id} className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                    {driver.image
                      ? <img src={driver.image} alt={driver.name} className="h-10 w-10 rounded-full object-cover" />
                      : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800">{driver.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</div>}
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-gray-900">{driver.name}</div>
                      <div className="text-xs text-gray-500">Licence {driver.licenseNumber}{driver.licenseType ? ` · Class ${driver.licenseType}` : ''}</div>
                      <div className={`mt-1 flex items-center gap-1 text-xs ${licenceStyle}`}>
                        {licenceDays <= 30 && <AlertTriangle className="h-3 w-3" />} {licenceLabel}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!!(selectedAsset.allocationHistory || []).length && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Allocation history</div>
                <div className="mt-3 space-y-3">
                  {[...(selectedAsset.allocationHistory || [])].reverse().slice(0, 4).map(record => (
                    <div key={record.id} className="flex justify-between gap-3 text-xs">
                      <div><div className="font-bold text-gray-800">{record.driverName}</div><div className="mt-0.5 text-gray-500">{record.reason || 'Driver allocation'}</div></div>
                      <div className="shrink-0 text-right text-gray-500">{record.assignedFrom || 'Earlier'}{record.assignedTo ? ` – ${record.assignedTo}` : ' – Current'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                <span className="font-medium text-gray-900">
                  {selectedAsset.maintenance.lastServiceDate
                    ? selectedAsset.maintenance.lastServiceDate.split('-').reverse().join('/')
                    : 'Not recorded'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Odometer:</span>
                <span className="font-medium text-gray-900">{(selectedAsset.maintenance.lastOdometer || 0).toLocaleString()} km</span>
              </div>
              
              <div className="pt-4 border-t border-gray-100">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-500">Next Service Due</span>
                  <span className="font-medium text-gray-900">
                    {(() => {
                      const days = calculateDaysRemaining(selectedAsset.maintenance.nextServiceDate);
                      return days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`;
                    })()}
                  </span>
                </div>
                <div className="text-xs text-gray-400">Due {selectedAsset.maintenance.nextServiceDate.split('-').reverse().join('/')}</div>
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

      {/* Driver allocation modal */}
      {allocationModal && selectedAsset && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="driver-allocation-title">
          <div className="max-h-[96vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <h3 id="driver-allocation-title" className="text-lg font-bold text-gray-900">{selectedAsset.assignedDrivers.length ? 'Change current driver' : 'Assign a driver'}</h3>
            {selectedAsset.assignedDrivers[0] && <p className="mt-1 text-sm text-gray-500">Current: {selectedAsset.assignedDrivers[0].name}. This change will be retained in the allocation history.</p>}
            <form onSubmit={submitAllocation} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-gray-700">New driver name *</span><input required value={allocationForm.driverName} onChange={event => setAllocationForm({...allocationForm, driverName: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Licence number *</span><input required value={allocationForm.licenseNumber} onChange={event => setAllocationForm({...allocationForm, licenseNumber: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Licence class</span><input value={allocationForm.licenseClass} onChange={event => setAllocationForm({...allocationForm, licenseClass: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Licence expiry *</span><input required type="date" value={allocationForm.licenseExpiry} onChange={event => setAllocationForm({...allocationForm, licenseExpiry: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Effective date *</span><input required type="date" value={allocationForm.effectiveDate} onChange={event => setAllocationForm({...allocationForm, effectiveDate: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-gray-700">Reason / handover note</span><input value={allocationForm.reason} onChange={event => setAllocationForm({...allocationForm, reason: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => setAllocationModal(false)} className="rounded-lg px-4 py-2 font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800 disabled:opacity-60">{isSubmitting ? 'Saving…' : 'Confirm allocation'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Claim modal */}
      {claimModal && selectedAsset && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="claim-title">
          <div className="max-h-[96vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <h3 id="claim-title" className="text-lg font-bold text-gray-900">Record an asset claim</h3>
            <p className="mt-1 text-sm text-gray-500">Keep the incident, insurer, value and claim status with the asset record.</p>
            <form onSubmit={submitClaim} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Claim number *</span><input required value={claimForm.claimNumber} onChange={event => setClaimForm({...claimForm, claimNumber: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Incident date *</span><input required type="date" value={claimForm.incidentDate} onChange={event => setClaimForm({...claimForm, incidentDate: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Insurer</span><input value={claimForm.insurer} onChange={event => setClaimForm({...claimForm, insurer: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Claim amount (RM) *</span><input required min="0" step="0.01" type="number" value={claimForm.amount} onChange={event => setClaimForm({...claimForm, amount: Number(event.target.value)})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
                <label><span className="mb-1 block text-sm font-medium text-gray-700">Status</span><select value={claimForm.status} onChange={event => setClaimForm({...claimForm, status: event.target.value as typeof claimForm.status})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"><option value="OPEN">Open</option><option value="SUBMITTED">Submitted</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="SETTLED">Settled</option></select></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-gray-700">Incident / claim description *</span><textarea required rows={3} value={claimForm.description} onChange={event => setClaimForm({...claimForm, description: event.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></label>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => setClaimModal(false)} className="rounded-lg px-4 py-2 font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800 disabled:opacity-60">{isSubmitting ? 'Saving…' : 'Save claim'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AssetCreationWizard
        open={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        onCreate={createAsset}
      />
      <BulkAssetImportModal
        open={showBulkImport}
        existingIdentifiers={assets.map(asset => asset.registrationNumber)}
        onClose={() => setShowBulkImport(false)}
        onImport={createAssets}
      />
    </div>
  );
}
