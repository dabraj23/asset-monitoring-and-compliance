export type VendorOnboardingStatus =
  | 'DRAFT'
  | 'DOCUMENTS_PENDING'
  | 'VERIFYING'
  | 'REVIEW_REQUIRED'
  | 'IN_APPROVAL'
  | 'APPROVED'
  | 'CONDITIONALLY_APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'BLACKLISTED';

export type VendorCheckStatus = 'PASSED' | 'WARNING' | 'FAILED' | 'REVIEW_REQUIRED' | 'UNAVAILABLE';
export type VendorRecommendation = 'RECOMMEND_APPROVE' | 'RECOMMEND_CONDITIONAL' | 'NEEDS_REVIEW' | 'RECOMMEND_REJECT';
export type VendorRuleScope = 'COMPANY' | 'PERSON';
export type VendorConnector =
  | 'DOCUMENT_ONLY'
  | 'CIDB_CONTRACTOR'
  | 'CIDB_PERSONNEL'
  | 'DOSH_PERSONNEL'
  | 'DOSH_COMPANY'
  | 'MOTAC_TOBTAB'
  | 'LEGAL_SEARCH'
  | 'CTOS'
  | 'BANK_VERIFICATION';

export type VerificationStepType =
  | 'DOCUMENT_CLASSIFICATION'
  | 'STRUCTURED_EXTRACTION'
  | 'IDENTITY_MATCH'
  | 'EXPIRY_CHECK'
  | 'REGISTRY_LOOKUP'
  | 'CROSS_DOCUMENT_CHECK'
  | 'LEGAL_SEARCH'
  | 'MANUAL_FALLBACK'
  | 'RECOMMENDATION';

export interface VendorCategory {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface VendorRule {
  id: string;
  name: string;
  description: string;
  regulatorySource: string;
  scope: VendorRuleScope;
  categoryIds: string[];
  activityTagsAny: string[];
  personnelRolesAny: string[];
  documentType: string;
  requiredFields: string[];
  connector: VendorConnector;
  blocking: boolean;
  expiryWarningDays: number;
  followUpSlaDays: number;
  escalationOwner: string;
  steps: VerificationStepType[];
  active: boolean;
}

export interface VendorRuleVersion {
  version: number;
  publishedAt: string;
  rules: VendorRule[];
}

export interface VendorConfiguration {
  activeVersion: number;
  categories: VendorCategory[];
  draftRules: VendorRule[];
  publishedVersions: VendorRuleVersion[];
  approvalStages: Array<{ id: string; name: string; requiredRole: string }>;
}

export interface VendorPersonnel {
  id: string;
  name: string;
  role: string;
  identityMasked: string;
  identityHash: string;
  siteAssignment: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence: number;
  sourceReference: string;
  corrected?: boolean;
}

export interface VendorDocument {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  documentType: string;
  subjectId?: string;
  subjectName?: string;
  uploadedAt: string;
  extractionStatus: 'QUEUED' | 'EXTRACTING' | 'COMPLETED' | 'REVIEW_REQUIRED' | 'FAILED';
  extractedFields: ExtractedField[];
  storagePath: string;
}

export interface ExternalVerification {
  id: string;
  ruleId: string;
  subjectId?: string;
  connector: VendorConnector;
  status: VendorCheckStatus;
  matchStatus: 'MATCH' | 'NO_MATCH' | 'MULTIPLE' | 'REVIEW_REQUIRED' | 'UNAVAILABLE';
  officialName?: string;
  registrationNumber?: string;
  scope?: string;
  validFrom?: string;
  validUntil?: string;
  authority: string;
  sourceUrl: string;
  checkedAt: string;
  summary: string;
  citations: Array<{ title: string; url: string }>;
  limitation?: string;
}

export interface RequirementResult {
  id: string;
  ruleId: string;
  ruleName: string;
  scope: VendorRuleScope;
  subjectId?: string;
  subjectName: string;
  blocking: boolean;
  status: VendorCheckStatus;
  reason: string;
  expiresAt?: string;
  evidenceIds: string[];
  verificationIds: string[];
}

export interface VendorFollowUp {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  owner: string;
  status: 'OPEN' | 'COMPLETED' | 'OVERDUE';
  ruleId?: string;
  subjectId?: string;
  sourceUrl?: string;
}

export interface VendorApprovalEvent {
  id: string;
  stageId: string;
  stageName: string;
  requiredRole: string;
  actor: string;
  decision: 'APPROVED' | 'CONDITIONAL' | 'REJECTED';
  notes: string;
  createdAt: string;
}

export interface VendorPerformanceAssessment {
  id: string;
  period: string;
  scores: Record<'quality' | 'delivery' | 'cost' | 'service' | 'safety' | 'compliance', number>;
  weights: Record<'quality' | 'delivery' | 'cost' | 'service' | 'safety' | 'compliance', number>;
  weightedScore: number;
  reviewer: string;
  comments: string;
  reviewedAt: string;
  nextReviewDate: string;
}

export interface VendorEntityLink {
  id: string;
  entityType: 'ASSET' | 'LOCATION';
  entityId: string;
  entityName: string;
  relationship: 'OPERATOR' | 'MAINTENANCE_PROVIDER' | 'INSTALLER' | 'INSPECTOR' | 'SUPPLIER' | 'LICENCE_HOLDER';
  personnelId?: string;
  personnelName?: string;
  createdAt: string;
}

export interface VendorAuditEvent {
  id: string;
  type: string;
  actor: string;
  summary: string;
  createdAt: string;
}

export interface Vendor {
  id: string;
  legalName: string;
  registrationNumber: string;
  categoryId: string;
  categoryName: string;
  services: string[];
  activityTags: string[];
  contactName: string;
  email: string;
  phone: string;
  address: string;
  onboardingStatus: VendorOnboardingStatus;
  recommendation: VendorRecommendation;
  recommendationSummary: string;
  ruleVersion: number;
  currentApprovalStage: number;
  personnel: VendorPersonnel[];
  documents: VendorDocument[];
  verifications: ExternalVerification[];
  requirementResults: RequirementResult[];
  followUps: VendorFollowUp[];
  approvals: VendorApprovalEvent[];
  entityLinks: VendorEntityLink[];
  performanceAssessments: VendorPerformanceAssessment[];
  auditTrail: VendorAuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface VerificationJob {
  id: string;
  vendorId: string;
  stage: 'QUEUED' | 'EXTRACTING' | 'APPLYING_RULES' | 'CHECKING_EXTERNAL_SOURCES' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  progress: number;
  message: string;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface VendorNotification {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  message: string;
  dueDate: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  read: boolean;
  createdAt: string;
}

export interface EmailOutboxItem {
  id: string;
  vendorId: string;
  to: string;
  subject: string;
  body: string;
  status: 'PENDING_DEMO';
  createdAt: string;
}

export interface VendorDashboardData {
  totalVendors: number;
  onboarding: number;
  approved: number;
  reviewRequired: number;
  nonCompliant: number;
  expiringSoon: number;
  overdueActions: number;
  annualReviewsDue: number;
  notifications: VendorNotification[];
  outbox: EmailOutboxItem[];
}

export interface VendorRuleImpactPreview {
  nextVersion: number;
  changedRuleIds: string[];
  affectedVendors: Array<{ id: string; legalName: string; onboardingStatus: VendorOnboardingStatus }>;
}

export interface CreateVendorInput {
  legalName: string;
  registrationNumber: string;
  categoryId: string;
  services: string[];
  activityTags: string[];
  contactName: string;
  email: string;
  phone: string;
  address: string;
  personnel: Array<{
    name: string;
    role: string;
    identityNumber: string;
    siteAssignment: string;
  }>;
}

export interface VendorFileInput {
  fileName: string;
  mimeType: string;
  data: string;
  declaredType?: string;
  subjectId?: string;
}

export const vendorActivityOptions = [
  { value: 'CONSTRUCTION_WORK', label: 'Performs construction work' },
  { value: 'SITE_ACCESS', label: 'Personnel enter construction sites' },
  { value: 'REGULATED_PLANT_WORK', label: 'Installs, services or inspects regulated plant' },
  { value: 'ELECTRICAL_WORK', label: 'Performs electrical work' },
  { value: 'GAS_WORK', label: 'Performs gas-related work' },
  { value: 'FIRE_SAFETY_WORK', label: 'Performs fire-safety work' },
  { value: 'FUEL_DIESEL_OPERATIONS', label: 'Stores or handles fuel / diesel' },
  { value: 'PUBLIC_PERFORMANCE_MUSIC', label: 'Uses public-performance music' },
  { value: 'FOOD_SERVICE', label: 'Provides food-related services' },
  { value: 'TICKETING', label: 'Provides travel or ticketing services' },
] as const;

export const vendorPersonnelRoles = [
  'GENERAL_WORKER',
  'SKILLED_TRADE',
  'SITE_SUPERVISOR',
  'PROJECT_MANAGER',
  'CRANE_OPERATOR',
  'SCAFFOLD_OPERATOR',
  'BOILER_OPERATOR',
  'ELECTRICAL_COMPETENT_PERSON',
  'OTHER',
] as const;

export const vendorDocumentTypes = [
  'CIDB_CONTRACTOR_REGISTRATION',
  'CIDB_GREEN_CARD',
  'CIDB_COMPETENCY_CERTIFICATE',
  'DOSH_OPERATOR_CERTIFICATE',
  'DOSH_COMPETENT_COMPANY',
  'OSH_POLICY',
  'HIRARC',
  'SAFETY_TRAINING_RECORDS',
  'INCIDENT_RECORDS',
  'PPE_CONTROL_RECORDS',
  'MOTAC_TOBTAB_LICENSE',
  'CTOS_REPORT',
  'ABAC_DECLARATION',
  'VENDOR_AGREEMENT',
  'INSURANCE_CERTIFICATE',
  'BANK_VERIFICATION',
  'TENDER_COMPLIANCE',
  'CONFLICT_OF_INTEREST',
  'CIT_RECORDS',
  'DOSH_CLEARANCE',
  'FUEL_DIESEL_LICENSE',
  'FIRE_CERTIFICATE',
  'SPKA_RECORD',
  'ENERGY_LICENSE',
  'GAS_LICENSE',
  'PPM_LICENSE',
  'FOOD_PREMISE_LICENSE',
  'FOOD_HANDLER_CERTIFICATE',
  'TICKETING_COUNTER_LICENSE',
  'OTHER',
] as const;
