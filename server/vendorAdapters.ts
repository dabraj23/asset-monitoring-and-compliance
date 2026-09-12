import type { CreateVendorInput, ExternalVerification, Vendor, VendorFileInput, VendorRule } from '../src/vendorTypes.ts';

/** Stable contracts for replacing the hybrid demo components without changing vendor workflows. */
export interface VendorPersistenceAdapter {
  listVendors(): Promise<Vendor[]>;
  getVendor(id: string): Promise<Vendor | undefined>;
  saveVendor(vendor: Vendor): Promise<Vendor>;
}

export interface VendorObjectStorageAdapter {
  put(input: { vendorId: string; documentId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ storageKey: string }>;
  get(storageKey: string): Promise<Buffer>;
}

export interface VendorIngestionBatch {
  source: 'FORM' | 'CSV' | 'API' | 'WEBHOOK' | 'SFTP';
  externalBatchId?: string;
  vendors: CreateVendorInput[];
  documents: Array<VendorFileInput & { vendorRegistrationNumber: string }>;
  receivedAt: string;
}

export interface VendorIngestionAdapter {
  readonly source: VendorIngestionBatch['source'];
  receive(): Promise<VendorIngestionBatch[]>;
  acknowledge(externalBatchId: string, result: { accepted: number; rejected: number; errors: string[] }): Promise<void>;
}

export interface VendorExternalVerificationAdapter {
  readonly connector: VendorRule['connector'];
  verify(input: {
    vendor: Vendor;
    rule: VendorRule;
    subjectId?: string;
    transientIdentityNumber?: string;
  }): Promise<ExternalVerification>;
}

export interface VendorEventPublisher {
  publish(event: {
    type: 'VENDOR_CREATED' | 'DOCUMENT_RECEIVED' | 'VERIFICATION_COMPLETED' | 'APPROVAL_CHANGED' | 'EXPIRY_ALERT';
    vendorId: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}
