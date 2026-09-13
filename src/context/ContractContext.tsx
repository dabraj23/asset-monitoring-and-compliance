import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  Contract,
  ContractClause,
  ContractConfiguration,
  ContractDashboardData,
  ContractDocument,
  ContractFileInput,
  ContractJob,
  ContractObligation,
  ContractPlaybookRule,
  ContractTemplate,
  CorporateEntity,
  CreateContractInput,
  CreateCorporateEntityInput,
} from '../contractTypes';

interface FileDescriptor {
  file: File;
  documentType?: ContractFileInput['documentType'];
  signed?: boolean;
  authoritative?: boolean;
  relatedDocumentId?: string;
  effectiveDate?: string;
}

interface ContractContextValue {
  contracts: Contract[];
  entities: CorporateEntity[];
  configuration: ContractConfiguration | null;
  dashboard: ContractDashboardData | null;
  jobs: ContractJob[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  createEntity: (input: CreateCorporateEntityInput) => Promise<CorporateEntity>;
  updateEntity: (id: string, input: Partial<CorporateEntity>) => Promise<CorporateEntity>;
  uploadSmartFiles: (input: CreateContractInput, files: FileDescriptor[]) => Promise<{ contract: Contract; job: ContractJob }>;
  uploadDocuments: (contractId: string, files: FileDescriptor[]) => Promise<ContractJob>;
  reprocessContract: (contractId: string) => Promise<ContractJob>;
  createDraft: (input: CreateContractInput) => Promise<Contract>;
  updateContract: (id: string, input: Partial<Contract>) => Promise<Contract>;
  reviewClause: (contractId: string, clauseId: string, input: Partial<ContractClause>) => Promise<Contract>;
  createClause: (contractId: string, input: Partial<ContractClause>) => Promise<void>;
  updateDocument: (contractId: string, documentId: string, input: Partial<ContractDocument>) => Promise<Contract>;
  reviewDocumentChange: (contractId: string, documentId: string, decision: 'ACCEPTED' | 'REJECTED', rationale: string) => Promise<Contract>;
  signOffManualDocumentReview: (contractId: string, documentId: string, rationale: string) => Promise<Contract>;
  createObligation: (contractId: string, input: Partial<ContractObligation>) => Promise<void>;
  updateObligation: (contractId: string, obligationId: string, input: Partial<ContractObligation>) => Promise<Contract>;
  confirmObligation: (contractId: string, obligationId: string) => Promise<Contract>;
  completeObligation: (contractId: string, obligationId: string, evidence: string, linkedDocumentId?: string) => Promise<Contract>;
  saveDraft: (contractId: string, content: string, changeSummary: string) => Promise<Contract>;
  restoreDraft: (contractId: string, versionId: string) => Promise<Contract>;
  aiDraft: (contractId: string, instruction: string) => Promise<Contract>;
  submitReview: (contractId: string, notes: string) => Promise<Contract>;
  decideApproval: (contractId: string, decision: 'APPROVED' | 'REJECTED' | 'RETURNED', notes: string) => Promise<Contract>;
  markExecuted: (contractId: string) => Promise<Contract>;
  activateContract: (contractId: string) => Promise<Contract>;
  addPlaybookRule: (input: Partial<ContractPlaybookRule>) => Promise<{ configuration: ContractConfiguration; affectedContracts: string[] }>;
  createTemplate: (input: Partial<ContractTemplate>) => Promise<ContractConfiguration>;
  updateTemplate: (templateId: string, input: Partial<ContractTemplate>) => Promise<ContractConfiguration>;
  resolveReviewIssue: (contractId: string, issueId: string, decision: 'ACCEPTED' | 'RESOLVED', resolution: string) => Promise<Contract>;
}

const ContractContext = createContext<ContractContextValue | undefined>(undefined);

const requestJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The contract service request failed.');
  return data as T;
};

const fileToInput = async ({ file, documentType, signed, authoritative, relatedDocumentId, effectiveDate }: FileDescriptor): Promise<ContractFileInput> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const inferred: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return { fileName: file.name, mimeType: file.type || inferred[extension] || 'application/octet-stream', data: dataUrl.split(',')[1] || '', documentType, signed, authoritative, relatedDocumentId, effectiveDate };
};

export function ContractProvider({ children }: { children: ReactNode }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [entities, setEntities] = useState<CorporateEntity[]>([]);
  const [configuration, setConfiguration] = useState<ContractConfiguration | null>(null);
  const [dashboard, setDashboard] = useState<ContractDashboardData | null>(null);
  const [jobs, setJobs] = useState<ContractJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [contractData, entityData, configurationData, dashboardData] = await Promise.all([
      requestJson<Contract[]>('/api/contracts'), requestJson<CorporateEntity[]>('/api/corporate-entities'),
      requestJson<ContractConfiguration>('/api/contract-config'), requestJson<ContractDashboardData>('/api/contract-dashboard'),
    ]);
    setContracts(contractData); setEntities(entityData); setConfiguration(configurationData); setDashboard(dashboardData);
  }, []);

  useEffect(() => { refresh().catch(error => toast.error(error.message)).finally(() => setIsLoading(false)); }, [refresh]);

  useEffect(() => {
    const active = jobs.filter(job => !['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage));
    if (!active.length) return;
    const timer = window.setInterval(async () => {
      const updated = await Promise.all(jobs.map(job => ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage) ? job : requestJson<ContractJob>(`/api/contract-jobs/${job.id}`).catch(() => job)));
      setJobs(updated);
      const completed = updated.some(job => ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage) && active.some(previous => previous.id === job.id && !['COMPLETED', 'PARTIAL', 'FAILED'].includes(previous.stage)));
      if (completed) await refresh();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const track = (job: ContractJob) => setJobs(current => [job, ...current.filter(item => item.id !== job.id)].slice(0, 12));
  const updateLocal = (contract: Contract) => setContracts(current => current.map(item => item.id === contract.id ? contract : item));

  const createEntity = async (input: CreateCorporateEntityInput) => {
    const entity = await requestJson<CorporateEntity>('/api/corporate-entities', { method: 'POST', body: JSON.stringify(input) });
    setEntities(current => [...current, entity]); await refresh(); return entity;
  };
  const updateEntity = async (id: string, input: Partial<CorporateEntity>) => {
    const entity = await requestJson<CorporateEntity>(`/api/corporate-entities/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    setEntities(current => current.map(item => item.id === id ? entity : item)); await refresh(); return entity;
  };
  const uploadSmartFiles = async (input: CreateContractInput, files: FileDescriptor[]) => {
    const payload = { contract: input, files: await Promise.all(files.map(fileToInput)) };
    const result = await requestJson<{ contract: Contract; job: ContractJob }>('/api/contracts/smart-files', { method: 'POST', body: JSON.stringify(payload) });
    track(result.job); await refresh(); return result;
  };
  const uploadDocuments = async (contractId: string, files: FileDescriptor[]) => {
    const payload = { files: await Promise.all(files.map(fileToInput)) };
    const job = await requestJson<ContractJob>(`/api/contracts/${contractId}/documents`, { method: 'POST', body: JSON.stringify(payload) });
    track(job); await refresh(); return job;
  };
  const reprocessContract = async (contractId: string) => {
    const job = await requestJson<ContractJob>(`/api/contracts/${contractId}/reprocess`, { method: 'POST' });
    track(job); await refresh(); return job;
  };
  const createDraft = async (input: CreateContractInput) => {
    const contract = await requestJson<Contract>('/api/contracts/drafts', { method: 'POST', body: JSON.stringify(input) });
    setContracts(current => [contract, ...current]); await refresh(); return contract;
  };
  const updateContract = async (id: string, input: Partial<Contract>) => {
    const contract = await requestJson<Contract>(`/api/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    updateLocal(contract); await refresh(); return contract;
  };
  const reviewClause = async (contractId: string, clauseId: string, input: Partial<ContractClause>) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/clauses/${clauseId}`, { method: 'PATCH', body: JSON.stringify(input) });
    updateLocal(contract); await refresh(); return contract;
  };
  const createClause = async (contractId: string, input: Partial<ContractClause>) => {
    await requestJson(`/api/contracts/${contractId}/clauses`, { method: 'POST', body: JSON.stringify(input) }); await refresh();
  };
  const updateDocument = async (contractId: string, documentId: string, input: Partial<ContractDocument>) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/documents/${documentId}`, { method: 'PATCH', body: JSON.stringify(input) }); updateLocal(contract); await refresh(); return contract;
  };
  const reviewDocumentChange = async (contractId: string, documentId: string, decision: 'ACCEPTED' | 'REJECTED', rationale: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/documents/${documentId}/change-review`, { method: 'POST', body: JSON.stringify({ decision, rationale }) }); updateLocal(contract); await refresh(); return contract;
  };
  const signOffManualDocumentReview = async (contractId: string, documentId: string, rationale: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/documents/${documentId}/manual-review`, { method: 'POST', body: JSON.stringify({ rationale }) }); updateLocal(contract); await refresh(); return contract;
  };
  const createObligation = async (contractId: string, input: Partial<ContractObligation>) => {
    await requestJson(`/api/contracts/${contractId}/obligations`, { method: 'POST', body: JSON.stringify(input) }); await refresh();
  };
  const updateObligation = async (contractId: string, obligationId: string, input: Partial<ContractObligation>) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/obligations/${obligationId}`, { method: 'PATCH', body: JSON.stringify(input) });
    updateLocal(contract); await refresh(); return contract;
  };
  const confirmObligation = async (contractId: string, obligationId: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/obligations/${obligationId}/confirm`, { method: 'POST' }); updateLocal(contract); await refresh(); return contract;
  };
  const completeContractObligation = async (contractId: string, obligationId: string, evidence: string, linkedDocumentId?: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/obligations/${obligationId}/complete`, { method: 'POST', body: JSON.stringify({ evidence, linkedDocumentId }) });
    updateLocal(contract); await refresh(); return contract;
  };
  const saveDraft = async (contractId: string, content: string, changeSummary: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/draft-versions`, { method: 'POST', body: JSON.stringify({ content, changeSummary }) }); updateLocal(contract); return contract;
  };
  const restoreDraft = async (contractId: string, versionId: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/draft-versions/${versionId}/restore`, { method: 'POST' }); updateLocal(contract); await refresh(); return contract;
  };
  const aiDraft = async (contractId: string, instruction: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/ai-draft`, { method: 'POST', body: JSON.stringify({ instruction }) }); updateLocal(contract); return contract;
  };
  const submitReview = async (contractId: string, notes: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/submit-review`, { method: 'POST', body: JSON.stringify({ notes }) }); updateLocal(contract); await refresh(); return contract;
  };
  const decideApproval = async (contractId: string, decision: 'APPROVED' | 'REJECTED' | 'RETURNED', notes: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/approval`, { method: 'POST', body: JSON.stringify({ decision, notes }) }); updateLocal(contract); await refresh(); return contract;
  };
  const markExecuted = async (contractId: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/execute`, { method: 'POST' }); updateLocal(contract); await refresh(); return contract;
  };
  const activateContract = async (contractId: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/activate`, { method: 'POST' }); updateLocal(contract); await refresh(); return contract;
  };
  const addPlaybookRule = async (input: Partial<ContractPlaybookRule>) => {
    const result = await requestJson<{ configuration: ContractConfiguration; affectedContracts: string[] }>('/api/contract-config/playbook-rules', { method: 'POST', body: JSON.stringify(input) });
    setConfiguration(result.configuration); await refresh(); return result;
  };
  const createTemplate = async (input: Partial<ContractTemplate>) => {
    const result = await requestJson<ContractConfiguration>('/api/contract-config/templates', { method: 'POST', body: JSON.stringify(input) }); setConfiguration(result); return result;
  };
  const updateTemplate = async (templateId: string, input: Partial<ContractTemplate>) => {
    const result = await requestJson<ContractConfiguration>(`/api/contract-config/templates/${templateId}`, { method: 'PATCH', body: JSON.stringify(input) }); setConfiguration(result); return result;
  };
  const resolveReviewIssue = async (contractId: string, issueId: string, decision: 'ACCEPTED' | 'RESOLVED', resolution: string) => {
    const contract = await requestJson<Contract>(`/api/contracts/${contractId}/review-issues/${issueId}/resolve`, { method: 'POST', body: JSON.stringify({ decision, resolution }) });
    updateLocal(contract); await refresh(); return contract;
  };

  const value = useMemo<ContractContextValue>(() => ({
    contracts, entities, configuration, dashboard, jobs, isLoading, refresh, createEntity, updateEntity, uploadSmartFiles,
    uploadDocuments, reprocessContract, createDraft, updateContract, reviewClause, createClause, updateDocument, reviewDocumentChange, signOffManualDocumentReview, createObligation, updateObligation, confirmObligation,
    completeObligation: completeContractObligation, saveDraft, restoreDraft, aiDraft, submitReview, decideApproval, markExecuted, activateContract, addPlaybookRule, createTemplate, updateTemplate, resolveReviewIssue,
  }), [contracts, entities, configuration, dashboard, jobs, isLoading, refresh]);

  return <ContractContext.Provider value={value}>{children}</ContractContext.Provider>;
}

export function useContracts() {
  const value = useContext(ContractContext);
  if (!value) throw new Error('useContracts must be used within ContractProvider');
  return value;
}
