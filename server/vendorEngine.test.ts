import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSeedConfiguration,
  deriveRecommendation,
  evaluateVendor,
  getActiveRules,
  ruleAppliesToVendor,
} from './vendorEngine.ts';
import type { ExternalVerification, Vendor, VendorDocument, VendorRule } from '../src/vendorTypes.ts';

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor => ({
  id: 'vendor-1', legalName: 'Example Engineering Sdn Bhd', registrationNumber: '202601234567',
  categoryId: 'contractor-engineer', categoryName: 'Contractor / Engineer', services: ['Engineering'], activityTags: [],
  contactName: '', email: '', phone: '', address: '', onboardingStatus: 'DOCUMENTS_PENDING', recommendation: 'NEEDS_REVIEW',
  recommendationSummary: '', ruleVersion: 1, currentApprovalStage: 0, personnel: [], documents: [], verifications: [],
  requirementResults: [], followUps: [], approvals: [], entityLinks: [], performanceAssessments: [], auditTrail: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides,
});

const rules = getActiveRules(createSeedConfiguration());

test('contractor rules are activated by applicable work and personnel roles', () => {
  const vendor = makeVendor({
    activityTags: ['CONSTRUCTION_WORK', 'SITE_ACCESS'],
    personnel: [{ id: 'person-1', name: 'Operator A', role: 'CRANE_OPERATOR', identityMasked: '******1234', identityHash: 'hash', siteAssignment: 'Site A', status: 'ACTIVE' }],
  });
  const applicable = rules.filter(rule => ruleAppliesToVendor(rule, vendor)).map(rule => rule.id);
  assert.ok(applicable.includes('cidb-company'));
  assert.ok(applicable.includes('cidb-green-card'));
  assert.ok(applicable.includes('dosh-crane'));
  assert.ok(applicable.includes('osha-policy'));
  assert.ok(!applicable.includes('dosh-company'));
  assert.ok(!applicable.includes('food-premise'));
});

test('non-regulated supplier does not receive CIDB, DOSH or OSHA requirements', () => {
  const vendor = makeVendor({ categoryId: 'purchasing-supplier', categoryName: 'Purchasing Supplier', activityTags: [] });
  const applicable = rules.filter(rule => ruleAppliesToVendor(rule, vendor)).map(rule => rule.id);
  assert.ok(!applicable.some(id => id.startsWith('cidb-') || id.startsWith('dosh-') || id.startsWith('osha-')));
  assert.ok(applicable.includes('ctos'));
  assert.ok(applicable.includes('bank'));
});

test('company verification does not cause personnel verification to pass', () => {
  const fields = [
    ['companyName', 'Example Engineering Sdn Bhd'], ['registrationNumber', '202601234567'],
    ['grade', 'G7'], ['expiryDate', '2099-12-31'],
  ].map(([key, value]) => ({ key, label: key, value, confidence: 0.99, sourceReference: 'page 1' }));
  const companyDocument: VendorDocument = {
    id: 'doc-company', fileName: 'cidb.pdf', mimeType: 'application/pdf', size: 100, sha256: 'hash',
    documentType: 'CIDB_CONTRACTOR_REGISTRATION', uploadedAt: new Date().toISOString(), extractionStatus: 'COMPLETED',
    extractedFields: fields, storagePath: 'private',
  };
  const companyCheck: ExternalVerification = {
    id: 'check-company', ruleId: 'cidb-company', connector: 'CIDB_CONTRACTOR', status: 'PASSED', matchStatus: 'MATCH',
    authority: 'CIDB Malaysia', sourceUrl: 'https://mcp.cidb.gov.my/mcp/contractorsearch', checkedAt: new Date().toISOString(),
    summary: 'Official company registration matched.', citations: [],
  };
  const vendor = makeVendor({
    activityTags: ['CONSTRUCTION_WORK', 'SITE_ACCESS'], documents: [companyDocument], verifications: [companyCheck],
    personnel: [{ id: 'person-1', name: 'Worker A', role: 'GENERAL_WORKER', identityMasked: '******1234', identityHash: 'hash', siteAssignment: 'Site A', status: 'ACTIVE' }],
  });
  const results = evaluateVendor(vendor, rules);
  assert.equal(results.find(result => result.ruleId === 'cidb-company')?.status, 'PASSED');
  assert.equal(results.find(result => result.ruleId === 'cidb-green-card' && result.subjectId === 'person-1')?.status, 'FAILED');
});

test('expired evidence fails and blocks an approval recommendation', () => {
  const expiryRule: VendorRule = {
    id: 'expiry', name: 'Expiry check', description: '', regulatorySource: '', scope: 'COMPANY', categoryIds: [],
    activityTagsAny: [], personnelRolesAny: [], documentType: 'INSURANCE_CERTIFICATE', requiredFields: ['companyName', 'expiryDate'],
    connector: 'DOCUMENT_ONLY', blocking: true, expiryWarningDays: 60, followUpSlaDays: 7, escalationOwner: 'Risk',
    steps: ['DOCUMENT_CLASSIFICATION', 'STRUCTURED_EXTRACTION', 'EXPIRY_CHECK', 'RECOMMENDATION'], active: true,
  };
  const document: VendorDocument = {
    id: 'expired', fileName: 'insurance.pdf', mimeType: 'application/pdf', size: 100, sha256: 'hash',
    documentType: 'INSURANCE_CERTIFICATE', uploadedAt: new Date().toISOString(), extractionStatus: 'COMPLETED', storagePath: 'private',
    extractedFields: [
      { key: 'companyName', label: 'Company name', value: 'Example Engineering Sdn Bhd', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'expiryDate', label: 'Expiry date', value: '2020-01-01', confidence: 0.99, sourceReference: 'page 1' },
    ],
  };
  const results = evaluateVendor(makeVendor({ documents: [document] }), [expiryRule]);
  assert.equal(results[0].status, 'FAILED');
  assert.equal(deriveRecommendation(results), 'RECOMMEND_REJECT');
});

test('mandatory unavailable or review checks prevent approval recommendation', () => {
  assert.equal(deriveRecommendation([{ id: 'x', ruleId: 'x', ruleName: 'x', scope: 'COMPANY', subjectName: 'Vendor', blocking: true, status: 'UNAVAILABLE', reason: '', evidenceIds: [], verificationIds: [] }]), 'NEEDS_REVIEW');
  assert.equal(deriveRecommendation([{ id: 'x', ruleId: 'x', ruleName: 'x', scope: 'COMPANY', subjectName: 'Vendor', blocking: true, status: 'REVIEW_REQUIRED', reason: '', evidenceIds: [], verificationIds: [] }]), 'NEEDS_REVIEW');
});
