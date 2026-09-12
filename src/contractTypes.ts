export type CorporateEntityType = 'GROUP' | 'HOLDING_COMPANY' | 'SUBSIDIARY' | 'JOINT_VENTURE' | 'OTHER';

export type ContractRoleType =
  | 'CONTRACT_OWNER'
  | 'MONITORING_OWNER'
  | 'LEGAL_OWNER'
  | 'FINANCE_OWNER'
  | 'COMPLIANCE_OWNER'
  | 'RENEWAL_OWNER'
  | 'ESCALATION_OWNER'
  | 'SIGNATORY';

export interface RoleAssignment {
  id: string;
  role: ContractRoleType;
  name: string;
  email: string;
  department: string;
  activity?: string;
  approvalLimit?: number;
  backupName?: string;
}

export interface CorporateEntity {
  id: string;
  parentId?: string;
  legalName: string;
  displayName: string;
  entityType: CorporateEntityType;
  registrationNumber: string;
  jurisdiction: string;
  registeredAddress: string;
  aliases: string[];
  principalActivities: string[];
  businessUnits: string[];
  sites: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
  roleAssignments: RoleAssignment[];
  createdAt: string;
  updatedAt: string;
}

export type ContractSource = 'SIGNED_UPLOAD' | 'NEW_DRAFT';
export type ContractStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'ENTITY_REVIEW'
  | 'CLAUSE_REVIEW'
  | 'OBLIGATION_REVIEW'
  | 'OWNER_ASSIGNMENT'
  | 'READY_TO_ACTIVATE'
  | 'ACTIVE'
  | 'RENEWAL_REVIEW'
  | 'DRAFT'
  | 'LEGAL_REVIEW'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'EXECUTED'
  | 'EXPIRED'
  | 'CLOSED'
  | 'ARCHIVED';

export type ClauseRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReviewStatus = 'AI_EXTRACTED' | 'REVIEW_REQUIRED' | 'CONFIRMED' | 'REJECTED';
export type ObligationStatus = 'DRAFT' | 'OPEN' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED' | 'WAIVED';

export interface ContractDocument {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  version: number;
  documentType: 'SIGNED_CONTRACT' | 'DRAFT' | 'AMENDMENT' | 'SCHEDULE' | 'SUPPORTING_DOCUMENT';
  authoritative: boolean;
  signed: boolean;
  uploadedAt: string;
  extractionStatus: 'QUEUED' | 'EXTRACTING' | 'COMPLETED' | 'REVIEW_REQUIRED' | 'FAILED';
  storagePath: string;
}

export interface ContractClause {
  id: string;
  clauseNumber: string;
  heading: string;
  clauseType: string;
  sourceText: string;
  sourceReference: string;
  risk: ClauseRisk;
  deviation: string;
  applicableEntityIds: string[];
  responsibleParty: 'OUR_COMPANY' | 'COUNTERPARTY' | 'BOTH';
  confidence: number;
  reviewStatus: ReviewStatus;
  material: boolean;
}

export interface ContractObligation {
  id: string;
  clauseId?: string;
  entityId: string;
  responsibleParty: 'OUR_COMPANY' | 'COUNTERPARTY' | 'BOTH';
  title: string;
  action: string;
  ownerName: string;
  ownerEmail: string;
  monitoringOwnerName: string;
  monitoringOwnerEmail: string;
  escalationOwnerName: string;
  dueDate?: string;
  recurrence?: 'ONCE' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'ON_EVENT';
  nextDueDate?: string;
  alertDays: number[];
  evidenceRequired: string;
  blocking: boolean;
  status: ObligationStatus;
  completedAt?: string;
  completionEvidence?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractOwnerSet {
  contractOwnerName: string;
  contractOwnerEmail: string;
  monitoringOwnerName: string;
  monitoringOwnerEmail: string;
  legalOwnerName: string;
  legalOwnerEmail: string;
  renewalOwnerName: string;
  renewalOwnerEmail: string;
}

export interface ContractApprovalEvent {
  id: string;
  stage: string;
  role: string;
  actor: string;
  decision: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RETURNED';
  notes: string;
  createdAt: string;
}

export interface ContractAuditEvent {
  id: string;
  type: string;
  actor: string;
  summary: string;
  createdAt: string;
}

export interface ContractReviewIssue {
  id: string;
  ruleId?: string;
  clauseId?: string;
  type: 'MISSING_REQUIRED_CLAUSE' | 'PLAYBOOK_DEVIATION' | 'LOW_CONFIDENCE' | 'ENTITY_MAPPING' | 'OWNER_MAPPING';
  title: string;
  detail: string;
  severity: ClauseRisk;
  ownerRole: string;
  status: 'OPEN' | 'ACCEPTED' | 'RESOLVED';
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ContractDraftVersion {
  id: string;
  version: number;
  content: string;
  author: string;
  changeSummary: string;
  createdAt: string;
}

export interface Contract {
  id: string;
  contractNumber: string;
  title: string;
  contractType: string;
  source: ContractSource;
  status: ContractStatus;
  primaryEntityId: string;
  coveredEntityIds: string[];
  businessUnit: string;
  principalActivity: string;
  siteOrProject: string;
  counterpartyName: string;
  counterpartyRegistrationNumber: string;
  vendorId?: string;
  purpose: string;
  value: number;
  currency: string;
  effectiveDate?: string;
  expiryDate?: string;
  noticePeriodDays?: number;
  noticeDeadline?: string;
  autoRenewal: boolean;
  owners: ContractOwnerSet;
  documents: ContractDocument[];
  clauses: ContractClause[];
  obligations: ContractObligation[];
  approvals: ContractApprovalEvent[];
  draftContent: string;
  draftVersions: ContractDraftVersion[];
  templateId?: string;
  parentContractId?: string;
  familyType: 'MASTER' | 'STATEMENT_OF_WORK' | 'AMENDMENT' | 'STANDALONE';
  activationGaps: string[];
  reviewIssues: ContractReviewIssue[];
  auditTrail: ContractAuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ContractTemplate {
  id: string;
  name: string;
  contractType: string;
  description: string;
  content: string;
  requiredClauseTypes: string[];
  approved: boolean;
  version: number;
  updatedAt: string;
}

export interface ContractJob {
  id: string;
  contractId: string;
  documentIds: string[];
  stage: 'QUEUED' | 'CLASSIFYING' | 'ENTITY_RESOLUTION' | 'EXTRACTING_CLAUSES' | 'GENERATING_OBLIGATIONS' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ContractNotification {
  id: string;
  contractId: string;
  contractTitle: string;
  obligationId?: string;
  ownerEmail: string;
  title: string;
  message: string;
  dueDate: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  createdAt: string;
}

export interface ContractEmailOutboxItem {
  id: string;
  contractId: string;
  to: string;
  subject: string;
  body: string;
  status: 'PENDING_DEMO';
  createdAt: string;
}

export interface ContractDashboardData {
  totalContracts: number;
  activeContracts: number;
  draftsInReview: number;
  entityReview: number;
  renewalsDue: number;
  obligationsDueSoon: number;
  overdueObligations: number;
  unassignedObligations: number;
  openReviewIssues: number;
  upcoming: Array<{
    contractId: string;
    contractTitle: string;
    obligationId?: string;
    title: string;
    dueDate: string;
    owner: string;
    status: string;
  }>;
  notifications: ContractNotification[];
  outbox: ContractEmailOutboxItem[];
}

export interface ContractPlaybookRule {
  id: string;
  name: string;
  clauseType: string;
  applicableContractTypes: string[];
  entityIds: string[];
  principalActivities: string[];
  required: boolean;
  preferredPosition: string;
  redFlagTerms: string[];
  risk: ClauseRisk;
  ownerRole: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractConfiguration {
  playbookVersion: number;
  playbookRules: ContractPlaybookRule[];
  templates: ContractTemplate[];
  clauseTypes: string[];
  contractTypes: string[];
  alertDays: number[];
  approvalStages: Array<{ id: string; name: string; role: string; valueThreshold?: number }>;
}

export interface CreateCorporateEntityInput {
  parentId?: string;
  legalName: string;
  displayName: string;
  entityType: CorporateEntityType;
  registrationNumber: string;
  jurisdiction: string;
  registeredAddress: string;
  aliases: string[];
  principalActivities: string[];
  businessUnits: string[];
  sites: string[];
  effectiveFrom: string;
  roleAssignments: Array<Omit<RoleAssignment, 'id'>>;
}

export interface CreateContractInput {
  title: string;
  contractType: string;
  primaryEntityId: string;
  coveredEntityIds?: string[];
  businessUnit: string;
  principalActivity: string;
  siteOrProject: string;
  counterpartyName: string;
  counterpartyRegistrationNumber: string;
  vendorId?: string;
  purpose: string;
  value: number;
  currency: string;
  effectiveDate?: string;
  expiryDate?: string;
  noticePeriodDays?: number;
  autoRenewal?: boolean;
  templateId?: string;
  familyType?: Contract['familyType'];
  parentContractId?: string;
}

export interface ContractFileInput {
  fileName: string;
  mimeType: string;
  data: string;
  documentType?: ContractDocument['documentType'];
  signed?: boolean;
  authoritative?: boolean;
}
