import type {
  Contract,
  ContractClause,
  ContractConfiguration,
  ContractFileInput,
  ContractJob,
  ContractNotification,
  ContractObligation,
  CorporateEntity,
  CreateContractInput,
} from '../src/contractTypes.ts';

/** Stable boundaries for replacing the hybrid demo services without changing contract workflows. */
export interface ContractPersistenceAdapter {
  listEntities(): Promise<CorporateEntity[]>;
  getEntity(id: string): Promise<CorporateEntity | undefined>;
  saveEntity(entity: CorporateEntity): Promise<CorporateEntity>;
  listContracts(): Promise<Contract[]>;
  getContract(id: string): Promise<Contract | undefined>;
  saveContract(contract: Contract): Promise<Contract>;
  getConfiguration(): Promise<ContractConfiguration>;
  saveJob(job: ContractJob): Promise<ContractJob>;
}

export interface ContractObjectStorageAdapter {
  put(input: { contractId: string; documentId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ storageKey: string; sha256: string }>;
  get(storageKey: string): Promise<Buffer>;
}

export interface ContractIngestionBatch {
  source: 'FORM' | 'API' | 'WEBHOOK' | 'SFTP' | 'SHARED_FOLDER';
  externalBatchId?: string;
  contractHint: Partial<CreateContractInput>;
  files: ContractFileInput[];
  receivedAt: string;
}

export interface ContractIngestionAdapter {
  readonly source: ContractIngestionBatch['source'];
  receive(): Promise<ContractIngestionBatch[]>;
  acknowledge(externalBatchId: string, result: { contractId?: string; acceptedFiles: number; rejectedFiles: number; errors: string[] }): Promise<void>;
}

export interface ContractIntelligenceResult {
  metadata: Partial<CreateContractInput>;
  ourPartyCandidates: Array<{ legalName: string; registrationNumber?: string; confidence: number; sourceReference: string }>;
  clauses: Array<ContractClause & { proposedObligations: Partial<ContractObligation>[] }>;
  warnings: string[];
}

export interface ContractIntelligenceAdapter {
  analyse(input: { contract: Contract; entityContext: CorporateEntity[]; fileName: string; mimeType: string; data: Buffer }): Promise<ContractIntelligenceResult>;
  draft(input: { contract: Contract; entity: CorporateEntity; instruction: string; currentContent: string }): Promise<{ content: string; summary: string }>;
}

export interface ContractNotificationAdapter {
  deliver(notification: ContractNotification): Promise<{ providerId?: string; status: 'SENT' | 'QUEUED' | 'FAILED'; error?: string }>;
}

export interface ContractEventPublisher {
  publish(event: {
    type: 'CONTRACT_CREATED' | 'DOCUMENT_RECEIVED' | 'INTELLIGENCE_COMPLETED' | 'APPROVAL_CHANGED' | 'OBLIGATION_DUE' | 'CONTRACT_ACTIVATED';
    contractId: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

