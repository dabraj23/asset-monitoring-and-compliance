import type {
  ExternalVerification,
  RequirementResult,
  Vendor,
  VendorCategory,
  VendorCheckStatus,
  VendorConfiguration,
  VendorRecommendation,
  VendorRule,
  VerificationStepType,
} from '../src/vendorTypes.ts';
import { isAgreementRule } from './vendorAgreement.ts';
import { ruleAppliesToContext } from '../src/vendorChecklist.ts';

const standardSteps: VerificationStepType[] = [
  'DOCUMENT_CLASSIFICATION',
  'STRUCTURED_EXTRACTION',
  'IDENTITY_MATCH',
  'EXPIRY_CHECK',
  'REGISTRY_LOOKUP',
  'CROSS_DOCUMENT_CHECK',
  'MANUAL_FALLBACK',
  'RECOMMENDATION',
];

export const seededVendorCategories: VendorCategory[] = [
  { id: 'ticketing-agency', name: 'Ticketing Agency', description: 'Travel, tourism and ticketing agencies.', active: true },
  { id: 'contractor-engineer', name: 'Contractor / Engineer', description: 'Construction, engineering and regulated technical services.', active: true },
  { id: 'purchasing-supplier', name: 'Purchasing Supplier', description: 'Goods and services suppliers managed through Procurement.', active: true },
  { id: 'other-vendor', name: 'Other Vendor', description: 'Configurable onboarding for other vendor types.', active: true },
];

const rule = (input: Partial<VendorRule> & Pick<VendorRule, 'id' | 'name' | 'documentType'>): VendorRule => ({
  description: input.name,
  regulatorySource: 'Internal vendor policy',
  scope: 'COMPANY',
  categoryIds: [],
  activityTagsAny: [],
  personnelRolesAny: [],
  requiredFields: ['registrationNumber', 'expiryDate'],
  connector: 'DOCUMENT_ONLY',
  blocking: true,
  expiryWarningDays: 60,
  followUpSlaDays: 7,
  escalationOwner: 'Compliance / Risk',
  steps: standardSteps,
  active: true,
  ...input,
});

export const seededVendorRules: VendorRule[] = [
  rule({ id: 'cidb-company', name: 'CIDB contractor registration', description: 'Verify the contractor registration, grade, category and specialisation.', regulatorySource: 'CIDB Malaysia', categoryIds: ['contractor-engineer'], activityTagsAny: ['CONSTRUCTION_WORK'], documentType: 'CIDB_CONTRACTOR_REGISTRATION', connector: 'CIDB_CONTRACTOR', requiredFields: ['companyName', 'registrationNumber', 'grade', 'expiryDate'] }),
  rule({ id: 'cidb-green-card', name: 'CIDB personnel registration / Green Card', description: 'Verify every person assigned to enter a construction site.', regulatorySource: 'CIDB CIMS', scope: 'PERSON', activityTagsAny: ['SITE_ACCESS'], documentType: 'CIDB_GREEN_CARD', connector: 'CIDB_PERSONNEL', requiredFields: ['personName', 'certificateNumber', 'expiryDate'] }),
  rule({ id: 'cidb-competency', name: 'CIDB role competency', description: 'Verify competency for skilled trades, supervisors and project managers.', regulatorySource: 'CIDB CIMS', scope: 'PERSON', categoryIds: ['contractor-engineer'], personnelRolesAny: ['SKILLED_TRADE', 'SITE_SUPERVISOR', 'PROJECT_MANAGER'], documentType: 'CIDB_COMPETENCY_CERTIFICATE', connector: 'CIDB_PERSONNEL', requiredFields: ['personName', 'certificateNumber', 'competencyScope', 'expiryDate'] }),
  rule({ id: 'dosh-crane', name: 'DOSH crane operator competency', description: 'Verify the correct mobile, tower or derrick crane operator competency.', regulatorySource: 'DOSH / MyKKP', scope: 'PERSON', personnelRolesAny: ['CRANE_OPERATOR'], documentType: 'DOSH_OPERATOR_CERTIFICATE', connector: 'DOSH_PERSONNEL', requiredFields: ['personName', 'certificateNumber', 'competencyScope', 'expiryDate'] }),
  rule({ id: 'dosh-scaffold', name: 'DOSH scaffold operator competency', description: 'Verify the applicable basic, intermediate or advanced scaffold competency.', regulatorySource: 'DOSH / MyKKP', scope: 'PERSON', personnelRolesAny: ['SCAFFOLD_OPERATOR'], documentType: 'DOSH_OPERATOR_CERTIFICATE', connector: 'DOSH_PERSONNEL', requiredFields: ['personName', 'certificateNumber', 'competencyScope', 'expiryDate'] }),
  rule({ id: 'dosh-boiler', name: 'DOSH boiler operator competency', description: 'Verify the applicable steam boiler operator grade.', regulatorySource: 'DOSH / MyKKP', scope: 'PERSON', personnelRolesAny: ['BOILER_OPERATOR'], documentType: 'DOSH_OPERATOR_CERTIFICATE', connector: 'DOSH_PERSONNEL', requiredFields: ['personName', 'certificateNumber', 'competencyScope', 'expiryDate'] }),
  rule({ id: 'dosh-company', name: 'DOSH competent-company registration', description: 'Required when the vendor installs, services or inspects regulated plant.', regulatorySource: 'DOSH / MyKKP', activityTagsAny: ['REGULATED_PLANT_WORK'], documentType: 'DOSH_COMPETENT_COMPANY', connector: 'DOSH_COMPANY', requiredFields: ['companyName', 'certificateNumber', 'competencyScope', 'expiryDate'] }),
  rule({ id: 'osha-policy', name: 'Occupational safety and health policy', description: 'Current signed OSH policy and responsibilities.', regulatorySource: 'Occupational Safety and Health Act 1994', categoryIds: ['contractor-engineer'], activityTagsAny: ['SITE_ACCESS', 'CONSTRUCTION_WORK'], documentType: 'OSH_POLICY', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY' }),
  rule({ id: 'osha-hirarc', name: 'HIRARC assessment', description: 'Hazard identification, risk assessment and risk-control evidence.', regulatorySource: 'DOSH Malaysia', categoryIds: ['contractor-engineer'], activityTagsAny: ['SITE_ACCESS', 'CONSTRUCTION_WORK'], documentType: 'HIRARC', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY' }),
  rule({ id: 'osha-training', name: 'Safety training records', description: 'Training records relevant to the declared work activities.', regulatorySource: 'DOSH Malaysia', categoryIds: ['contractor-engineer'], activityTagsAny: ['SITE_ACCESS'], documentType: 'SAFETY_TRAINING_RECORDS', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY', blocking: false }),
  rule({ id: 'osha-incidents', name: 'Incident and corrective-action records', description: 'Incident declarations and evidence of corrective actions.', regulatorySource: 'DOSH Malaysia', categoryIds: ['contractor-engineer'], activityTagsAny: ['SITE_ACCESS'], documentType: 'INCIDENT_RECORDS', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY', blocking: false }),
  rule({ id: 'motac-tobtab', name: 'MOTAC TOBTAB licence', description: 'Verify ticketing or travel-agency licence and validity.', regulatorySource: 'MOTAC Malaysia', categoryIds: ['ticketing-agency'], activityTagsAny: ['TICKETING'], documentType: 'MOTAC_TOBTAB_LICENSE', connector: 'MOTAC_TOBTAB', requiredFields: ['companyName', 'licenseNumber', 'licenseScope', 'expiryDate'] }),
  rule({ id: 'cit-records', name: 'Cash-in-Transit records', description: 'Evidence for applicable cash collection and transit arrangements.', categoryIds: ['ticketing-agency'], documentType: 'CIT_RECORDS', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY', blocking: false }),
  rule({ id: 'dosh-clearance', name: 'DOSH clearance', description: 'Current DOSH clearance for the declared regulated plant activity.', regulatorySource: 'DOSH Malaysia', activityTagsAny: ['REGULATED_PLANT_WORK'], documentType: 'DOSH_CLEARANCE', requiredFields: ['companyName', 'certificateNumber', 'expiryDate'] }),
  rule({ id: 'fuel-diesel', name: 'Fuel / diesel licence', description: 'Licence covering the vendor’s declared fuel or diesel storage and handling.', activityTagsAny: ['FUEL_DIESEL_OPERATIONS'], documentType: 'FUEL_DIESEL_LICENSE', requiredFields: ['companyName', 'licenseNumber', 'licenseScope', 'expiryDate'] }),
  rule({ id: 'fire-certificate', name: 'Fire certificate', description: 'Current fire certificate for applicable premises or services.', activityTagsAny: ['FIRE_SAFETY_WORK'], documentType: 'FIRE_CERTIFICATE', requiredFields: ['companyName', 'certificateNumber', 'expiryDate'] }),
  rule({ id: 'spka', name: 'SPKA fire monitoring records', description: 'Evidence of applicable SPKA fire monitoring registration and validity.', activityTagsAny: ['FIRE_SAFETY_WORK'], documentType: 'SPKA_RECORD', requiredFields: ['companyName', 'registrationNumber', 'expiryDate'] }),
  rule({ id: 'energy-licence', name: 'Suruhanjaya Tenaga licence', description: 'Verify the electrical licence scope and validity.', regulatorySource: 'Suruhanjaya Tenaga', activityTagsAny: ['ELECTRICAL_WORK'], documentType: 'ENERGY_LICENSE', requiredFields: ['companyName', 'licenseNumber', 'licenseScope', 'expiryDate'] }),
  rule({ id: 'ppm-licence', name: 'Public Performance Malaysia licence', description: 'Current licence for applicable public-performance music use.', regulatorySource: 'Public Performance Malaysia', activityTagsAny: ['PUBLIC_PERFORMANCE_MUSIC'], documentType: 'PPM_LICENSE', requiredFields: ['companyName', 'licenseNumber', 'expiryDate'] }),
  rule({ id: 'gas-licence', name: 'Gas Persendirian licence', description: 'Current private gas licence for the declared work scope.', activityTagsAny: ['GAS_WORK'], documentType: 'GAS_LICENSE', requiredFields: ['companyName', 'licenseNumber', 'licenseScope', 'expiryDate'] }),
  rule({ id: 'ticketing-counter', name: 'Ticketing counter licence', description: 'Current licence for operating an applicable ticketing counter.', categoryIds: ['ticketing-agency'], activityTagsAny: ['TICKETING'], documentType: 'TICKETING_COUNTER_LICENSE', requiredFields: ['companyName', 'licenseNumber', 'expiryDate'] }),
  rule({ id: 'food-premise', name: 'Food premise registration licence', description: 'Current food-premise registration for applicable operations.', activityTagsAny: ['FOOD_SERVICE'], documentType: 'FOOD_PREMISE_LICENSE', requiredFields: ['companyName', 'licenseNumber', 'expiryDate'] }),
  rule({ id: 'food-handler', name: 'Food handler training certificate', description: 'Valid food-handler training evidence for each applicable worker.', scope: 'PERSON', activityTagsAny: ['FOOD_SERVICE'], documentType: 'FOOD_HANDLER_CERTIFICATE', requiredFields: ['personName', 'certificateNumber', 'expiryDate'] }),
  rule({ id: 'ctos', name: 'Vendor due diligence / CTOS', description: 'Extract an uploaded report; live verification requires a connected provider.', categoryIds: ['contractor-engineer', 'purchasing-supplier', 'ticketing-agency', 'other-vendor'], documentType: 'CTOS_REPORT', connector: 'CTOS', requiredFields: ['companyName', 'registrationNumber', 'issueDate'] }),
  rule({ id: 'abac', name: 'ABAC declaration', description: 'Signed Anti-Bribery and Anti-Corruption declaration.', categoryIds: ['contractor-engineer', 'purchasing-supplier', 'ticketing-agency', 'other-vendor'], documentType: 'ABAC_DECLARATION', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY' }),
  rule({ id: 'agreement', name: 'Vendor agreement validity', description: 'Current linked Contract Management agreement and expiry date.', categoryIds: ['contractor-engineer', 'purchasing-supplier', 'ticketing-agency', 'other-vendor'], documentType: 'CONTRACT_REFERENCE', requiredFields: [], connector: 'CONTRACT_STATUS' }),
  rule({ id: 'insurance', name: 'Vendor insurance validity', description: 'Verify the policy scope, insurer and expiry.', categoryIds: ['contractor-engineer', 'purchasing-supplier', 'ticketing-agency', 'other-vendor'], documentType: 'INSURANCE_CERTIFICATE', requiredFields: ['companyName', 'policyNumber', 'expiryDate'], connector: 'DOCUMENT_ONLY' }),
  rule({ id: 'bank', name: 'Bank account verification', description: 'Match bank evidence to the registered vendor identity.', categoryIds: ['contractor-engineer', 'purchasing-supplier', 'ticketing-agency', 'other-vendor'], documentType: 'BANK_VERIFICATION', connector: 'BANK_VERIFICATION', requiredFields: ['companyName', 'accountLastFour', 'issueDate'] }),
  rule({ id: 'tender', name: 'Tender requirement compliance', description: 'Evidence that mandatory tender requirements were accepted.', categoryIds: ['contractor-engineer', 'purchasing-supplier'], documentType: 'TENDER_COMPLIANCE', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY' }),
  rule({ id: 'conflict', name: 'Conflict-of-interest declaration', description: 'Signed conflict-of-interest declaration.', categoryIds: ['contractor-engineer', 'purchasing-supplier', 'ticketing-agency', 'other-vendor'], documentType: 'CONFLICT_OF_INTEREST', requiredFields: ['companyName', 'issueDate'], connector: 'DOCUMENT_ONLY' }),
  rule({ id: 'legal-search', name: 'Legal and adverse-information check', description: 'Grounded current-source search for material legal or regulatory concerns.', regulatorySource: 'Authoritative registries and cited public sources', categoryIds: ['contractor-engineer', 'purchasing-supplier', 'ticketing-agency', 'other-vendor'], documentType: 'OTHER', requiredFields: [], connector: 'LEGAL_SEARCH', steps: [...standardSteps, 'LEGAL_SEARCH'] }),
];

export const createSeedConfiguration = (): VendorConfiguration => ({
  activeVersion: 1,
  categories: structuredClone(seededVendorCategories),
  draftRules: structuredClone(seededVendorRules),
  publishedVersions: [{ version: 1, publishedAt: new Date().toISOString(), rules: structuredClone(seededVendorRules) }],
  approvalStages: [
    { id: 'procurement', name: 'Procurement Review', requiredRole: 'Procurement Reviewer' },
    { id: 'compliance', name: 'Compliance / Risk Review', requiredRole: 'Compliance Reviewer' },
    { id: 'final', name: 'Final Approval', requiredRole: 'Final Approver' },
  ],
});

export const getActiveRules = (configuration: VendorConfiguration, version = configuration.activeVersion) =>
  configuration.publishedVersions.find(item => item.version === version)?.rules || configuration.draftRules;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const ruleAppliesToVendor = (ruleDefinition: VendorRule, vendor: Vendor) => {
  return ruleAppliesToContext(ruleDefinition, {
    categoryId: vendor.categoryId,
    activityTags: vendor.activityTags,
    personnelRoles: vendor.personnel.map(person => person.role),
  });
};

const fieldValue = (vendor: Vendor, documentId: string, key: string) =>
  vendor.documents.find(document => document.id === documentId)?.extractedFields.find(field => field.key === key)?.value || '';

const fieldConfidence = (vendor: Vendor, documentId: string) => {
  const fields = vendor.documents.find(document => document.id === documentId)?.extractedFields || [];
  if (!fields.length) return 0;
  return fields.reduce((total, field) => total + field.confidence, 0) / fields.length;
};

const daysUntil = (date: string) => {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
};

const evaluateTarget = (vendor: Vendor, ruleDefinition: VendorRule, subjectId?: string, subjectName = vendor.legalName): RequirementResult => {
  const matchingEvidence = vendor.documents.filter(document =>
    document.documentType === ruleDefinition.documentType
    && (ruleDefinition.scope === 'COMPANY' ? !document.subjectId : document.subjectId === subjectId),
  );
  const verification = vendor.verifications.find(check => check.ruleId === ruleDefinition.id && check.subjectId === subjectId);
  const base: RequirementResult = {
    id: `${ruleDefinition.id}:${subjectId || 'company'}`,
    ruleId: ruleDefinition.id,
    ruleName: ruleDefinition.name,
    requestedDocumentType: ruleDefinition.connector === 'LEGAL_SEARCH' ? undefined : ruleDefinition.documentType,
    scope: ruleDefinition.scope,
    subjectId,
    subjectName,
    blocking: ruleDefinition.blocking,
    status: ruleDefinition.connector === 'LEGAL_SEARCH' ? 'REVIEW_REQUIRED' : 'PENDING_EVIDENCE',
    reason: ruleDefinition.connector === 'LEGAL_SEARCH' ? 'Public-source screening has not run yet.' : `Request ${ruleDefinition.documentType.replaceAll('_', ' ').toLowerCase()} evidence${subjectId ? ` for ${subjectName}` : ''}.`,
    evidenceIds: matchingEvidence.map(document => document.id),
    verificationIds: verification ? [verification.id] : [],
  };

  if (ruleDefinition.connector === 'LEGAL_SEARCH') return verification
    ? { ...base, status: verification.status, reason: verification.summary }
    : base;

  if (!matchingEvidence.length) return base;
  const evidence = matchingEvidence[0];
  if (evidence.extractionStatus === 'FAILED') return { ...base, status: 'REVIEW_REQUIRED', reason: 'The uploaded evidence could not be processed; review the original and retry.' };
  if (evidence.extractionStatus !== 'COMPLETED') return { ...base, status: 'REVIEW_REQUIRED', reason: 'Document extraction needs review.' };

  const confidence = fieldConfidence(vendor, evidence.id);
  if (ruleDefinition.requiredFields.length && confidence < 0.7) {
    return { ...base, status: 'REVIEW_REQUIRED', reason: 'Extracted fields require confirmation because confidence is below 70%.' };
  }

  const missingFields = ruleDefinition.requiredFields.filter(key => !fieldValue(vendor, evidence.id, key).trim());
  if (missingFields.length) {
    return { ...base, status: 'REVIEW_REQUIRED', reason: `Confirm the required extracted field(s): ${missingFields.join(', ')}.` };
  }

  const extractedRegistration = fieldValue(vendor, evidence.id, 'registrationNumber');
  if (extractedRegistration && vendor.registrationNumber && normalize(extractedRegistration) !== normalize(vendor.registrationNumber)) {
    return { ...base, status: 'FAILED', reason: 'The extracted registration number does not match the vendor profile.' };
  }

  const expiryDate = fieldValue(vendor, evidence.id, 'expiryDate');
  if (expiryDate) {
    const remaining = daysUntil(expiryDate);
    if (remaining < 0) return { ...base, status: 'FAILED', reason: `Evidence expired on ${expiryDate}.`, expiresAt: expiryDate };
    if (remaining <= ruleDefinition.expiryWarningDays) return { ...base, status: 'WARNING', reason: `Evidence expires in ${remaining} days.`, expiresAt: expiryDate };
  }

  if (ruleDefinition.connector !== 'DOCUMENT_ONLY') {
    if (!verification) return { ...base, status: 'REVIEW_REQUIRED', reason: 'External verification has not completed.', expiresAt: expiryDate || undefined };
    return { ...base, status: verification.status, reason: verification.summary, expiresAt: expiryDate || verification.validUntil };
  }

  return { ...base, status: 'PASSED', reason: 'Required evidence is present, matched and within its validity period.', expiresAt: expiryDate || undefined };
};

export const evaluateVendor = (vendor: Vendor, rules: VendorRule[]) => {
  const results: RequirementResult[] = [];
  for (const currentRule of rules.filter(item => ruleAppliesToVendor(item, vendor) && !isAgreementRule(item))) {
    if (currentRule.scope === 'COMPANY') {
      results.push(evaluateTarget(vendor, currentRule));
      continue;
    }
    const personnel = currentRule.personnelRolesAny.length
      ? vendor.personnel.filter(person => currentRule.personnelRolesAny.includes(person.role))
      : vendor.personnel;
    if (!personnel.length && !currentRule.personnelRolesAny.length) {
      results.push({
        id: `${currentRule.id}:missing-personnel`, ruleId: currentRule.id, ruleName: currentRule.name, scope: 'PERSON',
        subjectName: 'Personnel roster', blocking: currentRule.blocking, status: 'PENDING_EVIDENCE',
        requestedDocumentType: currentRule.documentType,
        reason: 'Confirm the applicable personnel roster before individual checks can run.', evidenceIds: [], verificationIds: [],
      });
      continue;
    }
    for (const person of personnel) results.push(evaluateTarget(vendor, currentRule, person.id, person.name));
  }
  return results;
};

export const deriveRecommendation = (results: RequirementResult[]): VendorRecommendation => {
  if (!results.length) return 'NEEDS_REVIEW';
  const blocking = results.filter(result => result.blocking);
  if (blocking.some(result => result.status === 'FAILED')) return 'RECOMMEND_REJECT';
  if (blocking.some(result => result.status === 'PENDING_EVIDENCE')) return 'AWAITING_EVIDENCE';
  if (blocking.some(result => result.status === 'REVIEW_REQUIRED' || result.status === 'UNAVAILABLE')) return 'NEEDS_REVIEW';
  if (results.some(result => result.status === 'PENDING_EVIDENCE')) return 'AWAITING_EVIDENCE';
  if (results.some(result => result.status === 'WARNING' || result.status === 'FAILED')) return 'RECOMMEND_CONDITIONAL';
  return 'RECOMMEND_APPROVE';
};

export const buildRecommendationSummary = (results: RequirementResult[], recommendation: VendorRecommendation) => {
  if (!results.length) return 'No applicable checks are configured for this case. A reviewer must confirm the category and publish an appropriate checklist before approval.';
  const counts = results.reduce<Record<VendorCheckStatus, number>>((accumulator, result) => {
    accumulator[result.status] += 1;
    return accumulator;
  }, { PENDING_EVIDENCE: 0, PASSED: 0, WARNING: 0, FAILED: 0, REVIEW_REQUIRED: 0, UNAVAILABLE: 0 });
  const label = recommendation.replace('RECOMMEND_', '').replace(/_/g, ' ').toLowerCase();
  const priority = recommendation === 'RECOMMEND_REJECT' ? ['FAILED']
    : recommendation === 'AWAITING_EVIDENCE' ? ['PENDING_EVIDENCE']
    : recommendation === 'NEEDS_REVIEW' ? ['REVIEW_REQUIRED', 'UNAVAILABLE']
    : recommendation === 'RECOMMEND_CONDITIONAL' ? ['WARNING', 'FAILED'] : ['PASSED'];
  const reasons = results.filter(result => priority.includes(result.status) && (recommendation === 'RECOMMEND_APPROVE' || result.blocking)).slice(0, 3)
    .map(result => `${result.ruleName}${result.scope === 'PERSON' ? ` (${result.subjectName})` : ''}: ${result.reason}`);
  const countsText = `${counts.PASSED} passed, ${counts.PENDING_EVIDENCE} awaiting evidence, ${counts.WARNING} warnings, ${counts.FAILED} failed, ${counts.REVIEW_REQUIRED} require review, ${counts.UNAVAILABLE} unavailable.`;
  return `Assessment: ${label}. ${countsText}${reasons.length ? ` Key reasons: ${reasons.join(' ')}` : ''}`;
};

export const externalSourceFor = (connector: VendorRule['connector']) => {
  const sources: Record<VendorRule['connector'], { authority: string; url: string }> = {
    DOCUMENT_ONLY: { authority: 'Uploaded evidence', url: '' },
    CONTRACT_STATUS: { authority: 'Contract Management', url: '' },
    CIDB_CONTRACTOR: { authority: 'CIDB Malaysia', url: 'https://mcp.cidb.gov.my/mcp/contractorsearch' },
    CIDB_PERSONNEL: { authority: 'CIDB CIMS', url: 'https://cims.cidb.gov.my/pbsearch/Forms/Transactions/search.aspx?opt=N' },
    DOSH_PERSONNEL: { authority: 'DOSH / MyKKP', url: 'https://mykkp.dosh.gov.my/myKKP/#/home/semakan-oyk' },
    DOSH_COMPANY: { authority: 'DOSH / MyKKP', url: 'https://mykkp.dosh.gov.my/myKKP/#/home/semakan-fyk' },
    MOTAC_TOBTAB: { authority: 'MOTAC Malaysia', url: 'https://www.motac.gov.my/en/kategori-semakan-new/agensi-pelancongan-tobtab/' },
    LEGAL_SEARCH: { authority: 'Cited public and regulatory sources', url: '' },
    CTOS: { authority: 'CTOS document evidence', url: '' },
    BANK_VERIFICATION: { authority: 'Bank document evidence', url: '' },
  };
  return sources[connector];
};

export const createRestrictedVerification = (vendor: Vendor, currentRule: VendorRule, subjectId?: string): ExternalVerification => {
  const source = externalSourceFor(currentRule.connector);
  const isCommercial = currentRule.connector === 'CTOS' || currentRule.connector === 'BANK_VERIFICATION';
  return {
    id: crypto.randomUUID(),
    ruleId: currentRule.id,
    subjectId,
    connector: currentRule.connector,
    status: 'REVIEW_REQUIRED',
    matchStatus: 'REVIEW_REQUIRED',
    authority: source.authority,
    sourceUrl: source.url,
    checkedAt: new Date().toISOString(),
    summary: isCommercial
      ? 'Uploaded evidence can be assessed, but live verification is unavailable until an approved provider is connected.'
      : 'The official portal requires CAPTCHA or authenticated access. A reviewer must record the official result.',
    citations: source.url ? [{ title: source.authority, url: source.url }] : [],
    limitation: isCommercial ? 'Provider credentials are not configured.' : 'Portal access controls prevent unattended verification.',
  };
};
