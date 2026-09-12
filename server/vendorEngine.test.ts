import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createSeedConfiguration,
  deriveRecommendation,
  evaluateVendor,
  getActiveRules,
  ruleAppliesToVendor,
} from './vendorEngine.ts';
import type { ExternalVerification, Vendor, VendorDocument, VendorRule } from '../src/vendorTypes.ts';
import { verifyDoshRecord } from './doshConnector.ts';

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

const jsonResponse = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
}));

test('live DOSH personnel verification matches certificate, identity hash, competency and expiry without retaining MyKad', async () => {
  const identityNumber = '840904085281';
  const person = {
    id: 'operator-1', name: 'Muhammad Azraee Bin Ahmad Shukri', role: 'CRANE_OPERATOR',
    identityMasked: '••••••5281', identityHash: createHash('sha256').update(identityNumber).digest('hex'),
    siteAssignment: 'Site A', status: 'ACTIVE' as const,
  };
  const document: VendorDocument = {
    id: 'dosh-cert', fileName: 'operator.pdf', mimeType: 'application/pdf', size: 100, sha256: 'dosh-cert',
    documentType: 'DOSH_OPERATOR_CERTIFICATE', subjectId: person.id, subjectName: person.name,
    uploadedAt: new Date().toISOString(), extractionStatus: 'COMPLETED', storagePath: 'private',
    extractedFields: [
      { key: 'personName', label: 'Person name', value: person.name, confidence: 0.99, sourceReference: 'page 1' },
      { key: 'certificateNumber', label: 'Certificate', value: 'PK/15/OK/02/143', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'competencyScope', label: 'Scope', value: 'Operator Kren', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'expiryDate', label: 'Expiry', value: '2099-09-10', confidence: 0.99, sourceReference: 'page 1' },
    ],
  };
  const rule = rules.find(item => item.id === 'dosh-crane')!;
  const result = await verifyDoshRecord({
    vendor: makeVendor({ personnel: [person], documents: [document] }), rule, subjectId: person.id,
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.deepEqual(payload, { jenisOYK: 'OYKOKren', kategori: 'noDaftar', search: 'PK/15/OK/02/143', page: 1, rows: 50 });
      return jsonResponse({ status_code: '200', status: 'success', return_set_01_data: [{
        nama: 'MUHAMMAD AZRAEE BIN AHMAD SHUKRI', noDaftar: 'PK/15/OK/02/143', ttamat: '2099-09-10T00:00:00',
        individuID: identityNumber, description: 'OPERATOR KREN', negeriMajikan: 'PERAK',
      }] });
    },
  });
  assert.equal(result.status, 'PASSED');
  assert.equal(result.matchStatus, 'MATCH');
  assert.equal(result.scope, 'OPERATOR KREN');
  assert.ok(!JSON.stringify(result).includes(identityNumber));
});

test('live DOSH personnel verification fails an official identity mismatch', async () => {
  const person = {
    id: 'operator-1', name: 'Operator Example', role: 'SCAFFOLD_OPERATOR', identityMasked: '••••••1111',
    identityHash: createHash('sha256').update('900101011111').digest('hex'), siteAssignment: '', status: 'ACTIVE' as const,
  };
  const document: VendorDocument = {
    id: 'dosh-cert', fileName: 'scaffold.pdf', mimeType: 'application/pdf', size: 100, sha256: 'scaffold-cert',
    documentType: 'DOSH_OPERATOR_CERTIFICATE', subjectId: person.id, subjectName: person.name,
    uploadedAt: new Date().toISOString(), extractionStatus: 'COMPLETED', storagePath: 'private',
    extractedFields: [
      { key: 'personName', label: 'Person name', value: person.name, confidence: 0.99, sourceReference: 'page 1' },
      { key: 'certificateNumber', label: 'Certificate', value: 'JKKP/PP/1', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'competencyScope', label: 'Scope', value: 'Pengendali Perancah', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'expiryDate', label: 'Expiry', value: '2099-12-31', confidence: 0.99, sourceReference: 'page 1' },
    ],
  };
  const result = await verifyDoshRecord({
    vendor: makeVendor({ personnel: [person], documents: [document] }), rule: rules.find(item => item.id === 'dosh-scaffold')!, subjectId: person.id,
    fetchImpl: async () => jsonResponse({ status_code: '200', status: 'success', return_set_01_data: [{
      nama: person.name, noDaftar: 'JKKP/PP/1', ttamat: '2099-12-31T00:00:00', individuID: '800101011111', description: 'PENGENDALI PERANCAH',
    }] }),
  });
  assert.equal(result.status, 'FAILED');
  assert.match(result.summary, /identity did not match/i);
});

test('live DOSH company verification normalizes an exact FYK registration', async () => {
  const document: VendorDocument = {
    id: 'fyk-cert', fileName: 'fyk.pdf', mimeType: 'application/pdf', size: 100, sha256: 'fyk-cert',
    documentType: 'DOSH_COMPETENT_COMPANY', uploadedAt: new Date().toISOString(), extractionStatus: 'COMPLETED', storagePath: 'private',
    extractedFields: [
      { key: 'companyName', label: 'Company name', value: 'Example Engineering Sdn Bhd', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'certificateNumber', label: 'FYK registration', value: 'JKKP/2023/22/37', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'competencyScope', label: 'Scope', value: 'HMM', confidence: 0.99, sourceReference: 'page 1' },
      { key: 'expiryDate', label: 'Expiry', value: '2099-09-12', confidence: 0.99, sourceReference: 'page 1' },
    ],
  };
  const result = await verifyDoshRecord({
    vendor: makeVendor({ activityTags: ['REGULATED_PLANT_WORK'], documents: [document] }), rule: rules.find(item => item.id === 'dosh-company')!,
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.kategori, 'noDaftarFYK');
      assert.equal(payload.semakanJenisFYKID, '1');
      return jsonResponse({ status_code: '200', status: 'success', return_set_01_data: [{
        namaFYK: 'EXAMPLE ENGINEERING SDN BHD', noDaftarFYK: 'JKKP/2023/22/37', tlulus: '2096-09-12T00:00:00',
        ttamat: '2099-09-12T00:00:00', JenisFYK: 'HMM', kodNegeriFYK: 'SELANGOR',
      }] });
    },
  });
  assert.equal(result.status, 'PASSED');
  assert.equal(result.registrationNumber, 'JKKP/2023/22/37');
  assert.equal(result.scope, 'HMM');
});

test('DOSH outage is unavailable and cannot be mistaken for a successful verification', async () => {
  const rule = rules.find(item => item.id === 'dosh-company')!;
  const result = await verifyDoshRecord({
    vendor: makeVendor(), rule,
    fetchImpl: async () => { throw new Error('network unavailable'); },
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.matchStatus, 'UNAVAILABLE');
  assert.match(result.summary, /approval remains blocked/i);
});
