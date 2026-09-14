import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CreateVendorInput,
  Vendor,
  VendorConfiguration,
  VendorDashboardData,
  VendorFileInput,
  VendorPerformanceAssessment,
  VendorPerformanceEvent,
  VendorRule,
  VendorRuleImpactPreview,
  VendorOwnershipEntry,
  VendorSiteMobilisation,
  VerificationJob,
} from '../vendorTypes';
import { useEntity } from './EntityContext';

interface UploadDescriptor {
  file: File;
  declaredType?: string;
  subjectId?: string;
}

interface VendorContextValue {
  vendors: Vendor[];
  configuration: VendorConfiguration | null;
  dashboard: VendorDashboardData | null;
  jobs: VerificationJob[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  createVendor: (input: CreateVendorInput) => Promise<Vendor>;
  createVendors: (inputs: CreateVendorInput[]) => Promise<Vendor[]>;
  uploadDocuments: (vendorId: string, files: UploadDescriptor[]) => Promise<VerificationJob>;
  runChecks: (vendorId: string) => Promise<VerificationJob>;
  recordManualVerification: (vendorId: string, verificationId: string, input: { status: 'PASSED' | 'WARNING' | 'FAILED'; officialName: string; registrationNumber: string; scope: string; validUntil: string; evidenceUrl: string; notes: string }) => Promise<void>;
  completeFollowUp: (vendorId: string, followUpId: string) => Promise<void>;
  submitApproval: (vendorId: string, decision: 'APPROVED' | 'CONDITIONAL' | 'REJECTED', notes: string) => Promise<void>;
  setLifecycleStatus: (vendorId: string, status: 'SUSPENDED' | 'BLACKLISTED' | 'APPROVED', reason: string) => Promise<void>;
  recordPerformance: (vendorId: string, input: Omit<VendorPerformanceAssessment, 'id' | 'weightedScore' | 'reviewer' | 'reviewedAt' | 'nextReviewDate'>) => Promise<void>;
  recordPerformanceEvent: (vendorId: string, input: Partial<VendorPerformanceEvent>) => Promise<void>;
  updatePerformanceEvent: (vendorId: string, eventId: string, input: Partial<VendorPerformanceEvent>) => Promise<void>;
  addCategory: (name: string, description: string) => Promise<void>;
  addRule: (rule: Partial<VendorRule>) => Promise<void>;
  updateRule: (id: string, rule: Partial<VendorRule>) => Promise<void>;
  updateCategory: (id: string, input: { name?: string; description?: string; active?: boolean }) => Promise<void>;
  updateVendor: (id: string, input: Partial<Vendor>) => Promise<void>;
  selectAgreement: (id: string, contractId: string) => Promise<void>;
  getRuleImpactPreview: () => Promise<VendorRuleImpactPreview>;
  publishRules: () => Promise<void>;
  updateDocumentFields: (vendorId: string, documentId: string, fields: Array<{ key: string; value: string }>, ownershipEntries?: VendorOwnershipEntry[]) => Promise<void>;
  linkEntity: (vendorId: string, input: { entityType: 'ASSET' | 'LOCATION'; entityId: string; entityName: string; relationship: string; personnelId?: string }) => Promise<void>;
  addPersonnel: (vendorId: string, input: { name: string; role: string; siteAssignment: string; identityNumber?: string }) => Promise<void>;
  updatePersonnel: (vendorId: string, personId: string, input: { name?: string; role?: string; siteAssignment?: string; status?: 'ACTIVE' | 'INACTIVE' }) => Promise<void>;
  createSiteMobilisation: (vendorId: string, siteName: string, personnelIds: string[]) => Promise<void>;
  updateSiteMobilisation: (vendorId: string, siteId: string, input: Pick<VendorSiteMobilisation, 'personnelIds' | 'inductionDocumentIds'>) => Promise<void>;
  decideSiteMobilisation: (vendorId: string, siteId: string, decision: 'APPROVED' | 'REJECTED', notes: string) => Promise<void>;
}

const VendorContext = createContext<VendorContextValue | undefined>(undefined);

const requestJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The vendor service request failed.');
  return data as T;
};

const fileToInput = async ({ file, declaredType, subjectId }: UploadDescriptor): Promise<VendorFileInput> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const inferredMimeTypes: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain',
  };
  return { fileName: file.name, mimeType: file.type || inferredMimeTypes[extension] || 'application/octet-stream', data: dataUrl.split(',')[1] || '', declaredType, subjectId };
};

export function VendorProvider({ children }: { children: ReactNode }) {
  const { selectedEntityId } = useEntity();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [configuration, setConfiguration] = useState<VendorConfiguration | null>(null);
  const [dashboard, setDashboard] = useState<VendorDashboardData | null>(null);
  const [jobs, setJobs] = useState<VerificationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [vendorData, configData, dashboardData] = await Promise.all([
      requestJson<Vendor[]>(`/api/vendors${selectedEntityId ? `?entityId=${encodeURIComponent(selectedEntityId)}` : ''}`),
      requestJson<VendorConfiguration>('/api/vendor-config'),
      requestJson<VendorDashboardData>(`/api/vendor-dashboard${selectedEntityId ? `?entityId=${encodeURIComponent(selectedEntityId)}` : ''}`),
    ]);
    setVendors(vendorData);
    setConfiguration(configData);
    setDashboard(dashboardData);
  }, [selectedEntityId]);

  useEffect(() => {
    refresh().catch(error => toast.error(error.message)).finally(() => setIsLoading(false));
  }, [refresh]);

  useEffect(() => {
    const active = jobs.filter(job => !['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage));
    if (!active.length) return;
    const timer = window.setInterval(async () => {
      const updated = await Promise.all(jobs.map(job => ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage)
        ? job
        : requestJson<VerificationJob>(`/api/verification-jobs/${job.id}`).catch(() => job)));
      setJobs(updated);
      const justFinished = updated.some(job => ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage)
        && active.some(previous => previous.id === job.id && !['COMPLETED', 'PARTIAL', 'FAILED'].includes(previous.stage)));
      if (justFinished) await refresh();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const track = (job: VerificationJob) => setJobs(current => [job, ...current.filter(item => item.id !== job.id)].slice(0, 10));

  const createVendor = async (input: CreateVendorInput) => {
    const vendor = await requestJson<Vendor>('/api/vendors', { method: 'POST', body: JSON.stringify(input) });
    setVendors(current => [...current, vendor]);
    await refresh();
    return vendor;
  };

  const createVendors = async (inputs: CreateVendorInput[]) => {
    const created = await requestJson<Vendor[]>('/api/vendors-bulk', { method: 'POST', body: JSON.stringify({ vendors: inputs }) });
    await refresh();
    return created;
  };

  const uploadDocuments = async (vendorId: string, uploads: UploadDescriptor[]) => {
    if (!uploads.length || uploads.length > 25) throw new Error('Choose between 1 and 25 files.');
    const files = await Promise.all(uploads.map(fileToInput));
    // Keep each JSON request below the server limit while retaining a 25-file intake.
    const chunks: VendorFileInput[][] = [];
    let chunk: VendorFileInput[] = [];
    let bytes = 0;
    for (const file of files) {
      if (chunk.length && bytes + file.data.length > 28 * 1024 * 1024) { chunks.push(chunk); chunk = []; bytes = 0; }
      chunk.push(file);
      bytes += file.data.length;
    }
    if (chunk.length) chunks.push(chunk);
    let job: VerificationJob | undefined;
    for (const batch of chunks) {
      job = await requestJson<VerificationJob>(`/api/vendors/${vendorId}/documents`, { method: 'POST', body: JSON.stringify({ files: batch }) });
      track(job);
    }
    await refresh();
    return job!;
  };

  const runChecks = async (vendorId: string) => {
    const job = await requestJson<VerificationJob>(`/api/vendors/${vendorId}/run-checks`, { method: 'POST' });
    track(job);
    await refresh();
    return job;
  };

  const recordManualVerification = async (vendorId: string, verificationId: string, input: { status: 'PASSED' | 'WARNING' | 'FAILED'; officialName: string; registrationNumber: string; scope: string; validUntil: string; evidenceUrl: string; notes: string }) => {
    await requestJson(`/api/vendors/${vendorId}/verifications/${verificationId}/manual-result`, { method: 'POST', body: JSON.stringify(input) });
    await refresh();
  };

  const completeFollowUp = async (vendorId: string, followUpId: string) => {
    await requestJson(`/api/vendors/${vendorId}/follow-ups/${followUpId}/complete`, { method: 'POST' });
    await refresh();
  };

  const submitApproval = async (vendorId: string, decision: 'APPROVED' | 'CONDITIONAL' | 'REJECTED', notes: string) => {
    await requestJson(`/api/vendors/${vendorId}/approval`, { method: 'POST', body: JSON.stringify({ decision, notes }) });
    await refresh();
  };

  const setLifecycleStatus = async (vendorId: string, status: 'SUSPENDED' | 'BLACKLISTED' | 'APPROVED', reason: string) => {
    await requestJson(`/api/vendors/${vendorId}/lifecycle`, { method: 'POST', body: JSON.stringify({ status, reason }) });
    await refresh();
  };

  const recordPerformance = async (vendorId: string, input: Omit<VendorPerformanceAssessment, 'id' | 'weightedScore' | 'reviewer' | 'reviewedAt' | 'nextReviewDate'>) => {
    await requestJson(`/api/vendors/${vendorId}/performance`, { method: 'POST', body: JSON.stringify(input) });
    await refresh();
  };
  const recordPerformanceEvent = async (vendorId: string, input: Partial<VendorPerformanceEvent>) => { await requestJson(`/api/vendors/${vendorId}/performance-events`, { method: 'POST', body: JSON.stringify(input) }); await refresh(); };
  const updatePerformanceEvent = async (vendorId: string, eventId: string, input: Partial<VendorPerformanceEvent>) => { await requestJson(`/api/vendors/${vendorId}/performance-events/${eventId}`, { method: 'PATCH', body: JSON.stringify(input) }); await refresh(); };

  const addCategory = async (name: string, description: string) => {
    const next = await requestJson<VendorConfiguration>('/api/vendor-config/categories', { method: 'POST', body: JSON.stringify({ name, description }) });
    setConfiguration(next);
  };

  const addRule = async (rule: Partial<VendorRule>) => {
    const next = await requestJson<VendorConfiguration>('/api/vendor-config/rules', { method: 'POST', body: JSON.stringify(rule) });
    setConfiguration(next);
  };
  const updateRule = async (id: string, rule: Partial<VendorRule>) => { setConfiguration(await requestJson<VendorConfiguration>(`/api/vendor-config/rules/${id}`, { method: 'PATCH', body: JSON.stringify(rule) })); };
  const updateCategory = async (id: string, input: { name?: string; description?: string; active?: boolean }) => { setConfiguration(await requestJson<VendorConfiguration>(`/api/vendor-config/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) })); };
  const updateVendor = async (id: string, input: Partial<Vendor>) => { await requestJson(`/api/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(input) }); await refresh(); };
  const selectAgreement = async (id: string, contractId: string) => { await requestJson(`/api/vendors/${id}/agreement`, { method: 'PATCH', body: JSON.stringify({ contractId }) }); await refresh(); };

  const publishRules = async () => {
    const next = await requestJson<VendorConfiguration>('/api/vendor-config/publish', { method: 'POST' });
    setConfiguration(next);
    await refresh();
  };

  const getRuleImpactPreview = () => requestJson<VendorRuleImpactPreview>('/api/vendor-config/impact-preview');

  const updateDocumentFields = async (vendorId: string, documentId: string, fields: Array<{ key: string; value: string }>, ownershipEntries?: VendorOwnershipEntry[]) => {
    await requestJson(`/api/vendors/${vendorId}/documents/${documentId}/fields`, { method: 'PATCH', body: JSON.stringify({ fields, ...(ownershipEntries === undefined ? {} : { ownershipEntries }) }) });
    await refresh();
  };

  const linkEntity = async (vendorId: string, input: { entityType: 'ASSET' | 'LOCATION'; entityId: string; entityName: string; relationship: string; personnelId?: string }) => {
    await requestJson(`/api/vendors/${vendorId}/entity-links`, { method: 'POST', body: JSON.stringify(input) });
    await refresh();
  };

  const addPersonnel = async (vendorId: string, input: { name: string; role: string; siteAssignment: string; identityNumber?: string }) => { await requestJson(`/api/vendors/${vendorId}/personnel`, { method: 'POST', body: JSON.stringify(input) }); await refresh(); };
  const updatePersonnel = async (vendorId: string, personId: string, input: { name?: string; role?: string; siteAssignment?: string; status?: 'ACTIVE' | 'INACTIVE' }) => { await requestJson(`/api/vendors/${vendorId}/personnel/${personId}`, { method: 'PATCH', body: JSON.stringify(input) }); await refresh(); };
  const createSiteMobilisation = async (vendorId: string, siteName: string, personnelIds: string[]) => { await requestJson(`/api/vendors/${vendorId}/site-mobilisations`, { method: 'POST', body: JSON.stringify({ siteName, personnelIds }) }); await refresh(); };
  const updateSiteMobilisation = async (vendorId: string, siteId: string, input: Pick<VendorSiteMobilisation, 'personnelIds' | 'inductionDocumentIds'>) => { await requestJson(`/api/vendors/${vendorId}/site-mobilisations/${siteId}`, { method: 'PATCH', body: JSON.stringify(input) }); await refresh(); };
  const decideSiteMobilisation = async (vendorId: string, siteId: string, decision: 'APPROVED' | 'REJECTED', notes: string) => { await requestJson(`/api/vendors/${vendorId}/site-mobilisations/${siteId}/decision`, { method: 'POST', body: JSON.stringify({ decision, notes }) }); await refresh(); };

  const value = useMemo<VendorContextValue>(() => ({
    vendors, configuration, dashboard, jobs, isLoading, refresh, createVendor, createVendors, uploadDocuments, runChecks, recordManualVerification,
    completeFollowUp, submitApproval, setLifecycleStatus, recordPerformance, recordPerformanceEvent, updatePerformanceEvent, addCategory, addRule, updateRule, updateCategory, updateVendor, selectAgreement, getRuleImpactPreview, publishRules, updateDocumentFields, linkEntity,
    addPersonnel, updatePersonnel, createSiteMobilisation, updateSiteMobilisation, decideSiteMobilisation,
  }), [vendors, configuration, dashboard, jobs, isLoading, refresh]);

  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendors() {
  const value = useContext(VendorContext);
  if (!value) throw new Error('useVendors must be used inside VendorProvider');
  return value;
}
