import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Contract } from '../src/contractTypes.ts';
import type { Vendor, VendorIntakeCase, VendorRiskCase } from '../src/vendorTypes.ts';

const storage = await mkdtemp(path.join(os.tmpdir(), 'vendor-contract-api-test-'));
process.env.CONTRACT_DATA_DIR = path.join(storage, 'contracts');
process.env.VENDOR_DATA_DIR = path.join(storage, 'vendors');
process.env.WORKFLOW_DATA_DIR = path.join(storage, 'workflow');
process.env.PLATFORM_DATA_DIR = path.join(storage, 'platform');
delete process.env.GEMINI_API_KEY;
const { vendorStore } = await import('./vendorStore.ts');
const { assetStore } = await import('./assetStore.ts');
const { contractStore } = await import('./contractStore.ts');
const { registerVendorRoutes } = await import('./vendorRoutes.ts');
const { registerContractRoutes } = await import('./contractRoutes.ts');
const { registerWorkRoutes } = await import('./workRoutes.ts');
const { assessSiteReadiness } = await import('./vendorSite.ts');
const app = express();
app.use(express.json());
app.use((request, _response, next) => { (request as any).platformUser = request.headers['x-test-owner'] ? { id: 'owner', name: 'Test Owner', email: String(request.headers['x-test-owner']), role: 'OWNER', entityIds: ['entity-axcelasia-builders'] } : { id: 'admin', name: 'Test Admin', email: 'admin@example.test', role: 'GROUP_ADMIN', entityIds: [] }; next(); });
await registerVendorRoutes(app);
await registerContractRoutes(app);
registerWorkRoutes(app);
const server = await new Promise<Server>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(storage, { recursive: true, force: true }); });

const api = async <T>(route: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() as T };
};

const ownerApi = async <T>(route: string, email: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', 'x-test-owner': email }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as T };
};

test('onboarding checklist follows vendor activity and personnel answers', async () => {
  const baseInput = { entityId: 'entity-axcelasia-builders', categoryId: 'contractor-engineer', activityTags: ['CONSTRUCTION_WORK', 'SITE_ACCESS'], personnel: [{ name: 'Crane Operator A', role: 'CRANE_OPERATOR' }] };
  const applicable = await api<{ items: Array<{ name: string; documentType?: string; source: string; subjectName?: string }> }>('/api/vendor-checklist-preview', 'POST', baseInput);
  assert.equal(applicable.status, 200);
  assert.ok(applicable.data.items.some(item => item.documentType === 'DOSH_OPERATOR_CERTIFICATE' && item.subjectName === 'Crane Operator A'));
  assert.ok(applicable.data.items.some(item => item.documentType === 'CIDB_GREEN_CARD' && item.subjectName === 'Crane Operator A'));
  assert.ok(applicable.data.items.some(item => item.source === 'SYSTEM' && item.name.includes('Legal')));
  const supplier = await api<{ items: Array<{ documentType?: string }> }>('/api/vendor-checklist-preview', 'POST', { ...baseInput, categoryId: 'purchasing-supplier', activityTags: [], personnel: [] });
  assert.equal(supplier.status, 200);
  assert.ok(!supplier.data.items.some(item => item.documentType === 'DOSH_OPERATOR_CERTIFICATE'));
});

test('checklist preview respects explicit person-level CIDB and DOSH answers', async () => {
  const preview = await api<{ items: Array<{ name: string; documentType?: string; subjectName?: string }> }>('/api/vendor-checklist-preview', 'POST', {
    entityId: 'entity-axcelasia-builders', categoryId: 'contractor-engineer', activityTags: ['CONSTRUCTION_WORK', 'SITE_ACCESS'],
    personnel: [
      { name: 'Office Admin', role: 'GENERAL_WORKER', cidbCheckRequired: false, doshCheckRequired: false },
      { name: 'Lift Operator', role: 'GENERAL_WORKER', complianceRoles: ['CRANE_OPERATOR'], cidbCheckRequired: false, doshCheckRequired: true },
    ],
  });
  assert.equal(preview.status, 200);
  assert.ok(preview.data.items.some(item => item.documentType === 'DOSH_OPERATOR_CERTIFICATE' && item.subjectName === 'Lift Operator'));
  assert.ok(!preview.data.items.some(item => item.documentType === 'CIDB_GREEN_CARD' && item.subjectName === 'Office Admin'));
  assert.ok(!preview.data.items.some(item => item.subjectName === 'Personnel roster'));
});

test('vendor approval follows the live contract record and refuses an expired renewal', async () => {
  const entityId = 'entity-axcelasia-builders';
  const vendor: Vendor = {
    id: 'vendor-contract-test', entityId, legalName: 'Test Engineering Sdn Bhd', registrationNumber: '202001234567',
    categoryId: 'other-vendor', categoryName: 'Other Vendor', services: [], activityTags: [], contactName: '', email: '', phone: '', address: '',
    onboardingStatus: 'IN_APPROVAL', recommendation: 'RECOMMEND_APPROVE', recommendationSummary: 'Other checks passed.', ruleVersion: 1,
    currentApprovalStage: 0, personnel: [], documents: [], verifications: [], requirementResults: [], followUps: [], approvals: [], entityLinks: [], performanceAssessments: [], auditTrail: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  await vendorStore.saveVendor(vendor);
  const missing = await api<Vendor>(`/api/vendors/${vendor.id}`);
  assert.equal(missing.data.requirementResults.find(result => result.ruleId === 'agreement')?.status, 'PENDING_EVIDENCE');
  assert.equal((await api<{ error: string }>(`/api/vendors/${vendor.id}/approval`, 'POST', { decision: 'APPROVED' })).status, 400);

  const contract: Contract = {
    id: 'vendor-contract-test-agreement', contractNumber: 'CTR-TEST-001', title: 'Service agreement', contractType: 'Service Agreement', source: 'SIGNED_UPLOAD', status: 'ACTIVE',
    primaryEntityId: entityId, coveredEntityIds: [entityId], businessUnit: '', principalActivity: '', siteOrProject: '', counterpartyName: vendor.legalName,
    counterpartyRegistrationNumber: vendor.registrationNumber, vendorId: vendor.id, purpose: '', value: 0, currency: 'MYR', effectiveDate: '2025-01-01', expiryDate: '2030-01-01', autoRenewal: false,
    owners: { contractOwnerName: '', contractOwnerEmail: '', monitoringOwnerName: '', monitoringOwnerEmail: '', legalOwnerName: '', legalOwnerEmail: '', renewalOwnerName: '', renewalOwnerEmail: '' },
    documents: [], clauses: [], obligations: [], approvals: [], draftContent: '', draftVersions: [], familyType: 'STANDALONE', activationGaps: [], reviewIssues: [], auditTrail: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  await contractStore.saveContract(contract);
  assert.equal((await api<Vendor>(`/api/vendors/${vendor.id}`)).data.requirementResults.find(result => result.ruleId === 'agreement')?.status, 'PASSED');

  assert.equal((await api<{ error: string }>(`/api/contracts/${contract.id}`, 'PATCH', { expiryDate: '2020-01-01' })).status, 200);
  const expired = await api<Vendor>(`/api/vendors/${vendor.id}`);
  assert.equal(expired.data.requirementResults.find(result => result.ruleId === 'agreement')?.status, 'FAILED');
  assert.equal((await api<{ error: string }>(`/api/vendors/${vendor.id}/approval`, 'POST', { decision: 'APPROVED' })).status, 400);
  const previouslyApproved = (await vendorStore.vendor(vendor.id))!;
  previouslyApproved.onboardingStatus = 'APPROVED';
  await vendorStore.saveVendor(previouslyApproved);
  const work = await api<Array<{ type: string; title: string }>>('/api/my-work');
  assert.ok(work.data.some(item => item.type === 'VENDOR' && item.title.includes('Vendor agreement validity')));
  const reassessed = (await vendorStore.vendor(vendor.id))!;
  assert.ok(reassessed.auditTrail.some(item => item.type === 'VENDOR_AGREEMENT_REASSESSED'));
  assert.equal(reassessed.onboardingStatus, 'APPROVED', 'an expiry flags reassessment but does not silently revoke human approval');

  const wrongVendor = await api<{ error: string }>(`/api/contracts/${contract.id}`, 'PATCH', { counterpartyRegistrationNumber: 'DIFFERENT' });
  assert.equal(wrongVendor.status, 400);
});

test('vendor follow-up owners can record progress and evidence without accessing another owner’s task', async () => {
  const vendor = (await vendorStore.vendor('vendor-contract-test'))!;
  vendor.followUps = [{ id: 'follow-up-evidence', title: 'Confirm bank evidence', description: 'Review bank letter', dueDate: '2026-12-01', owner: 'owner@example.test', status: 'OPEN' }];
  await vendorStore.saveVendor(vendor);
  const route = `/api/my-work/vendors/${vendor.id}/follow-ups/follow-up-evidence`;
  assert.equal((await ownerApi<{ error: string }>(`${route}/progress`, 'other@example.test', 'POST', { note: 'Not mine' })).status, 404);
  assert.equal((await ownerApi<Vendor>(`${route}/progress`, 'owner@example.test', 'POST', { note: 'Bank letter requested' })).status, 200);
  const evidence = await ownerApi<{ id: string }>(`${route}/evidence`, 'owner@example.test', 'POST', { fileName: 'bank-letter.txt', mimeType: 'text/plain', data: Buffer.from('Reviewed bank letter').toString('base64') });
  assert.equal(evidence.status, 201);
  assert.equal((await ownerApi<{ error: string }>(`/api/my-work/evidence/${evidence.data.id}`, 'other@example.test')).status, 404);
  assert.equal((await ownerApi<unknown>(`/api/my-work/evidence/${evidence.data.id}`, 'owner@example.test')).status, 200);
  const refreshed = (await vendorStore.vendor(vendor.id))!;
  assert.equal(refreshed.followUps[0].progressNote, 'Bank letter requested');
  assert.deepEqual(refreshed.followUps[0].evidenceFileIds, [evidence.data.id]);
});

test('site mobilisation is approved per site and named roster, with induction and competency gates', async () => {
  const entityId = 'entity-axcelasia-builders';
  const vendor: Vendor = {
    id: 'vendor-site-test', entityId, legalName: 'Site Crew Sdn Bhd', registrationNumber: '202009991111', categoryId: 'other-vendor', categoryName: 'Other Vendor',
    services: [], activityTags: ['SITE_ACCESS'], contactName: '', email: '', phone: '', address: '', onboardingStatus: 'APPROVED', recommendation: 'RECOMMEND_APPROVE', recommendationSummary: '', ruleVersion: 1,
    currentApprovalStage: 0, personnel: [{ id: 'worker-site-1', name: 'Worker One', role: 'SITE_WORKER', identityMasked: '••••1234', identityHash: 'hash', siteAssignment: 'Selangor Yard', status: 'ACTIVE' }],
    documents: [{ id: 'induction-site-1', fileName: 'induction.pdf', mimeType: 'application/pdf', size: 100, sha256: 'induction', documentType: 'SITE_INDUCTION', subjectId: 'worker-site-1', subjectName: 'Worker One', uploadedAt: '2026-01-01', extractionStatus: 'COMPLETED', extractedFields: [], storagePath: '' }],
    verifications: [], requirementResults: [{ id: 'worker-pass', ruleId: 'cidb-green-card', ruleName: 'CIDB Green Card', scope: 'PERSON', subjectId: 'worker-site-1', subjectName: 'Worker One', blocking: true, status: 'PASSED', reason: 'Verified', expiresAt: '2030-01-01', evidenceIds: [], verificationIds: [] }],
    followUps: [], approvals: [], entityLinks: [], performanceAssessments: [], siteMobilisations: [], auditTrail: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  await vendorStore.saveVendor(vendor);
  const baseContract = (await contractStore.contracts())[0];
  await contractStore.saveContract({ ...baseContract, id: 'vendor-site-agreement', vendorId: vendor.id, counterpartyName: vendor.legalName, counterpartyRegistrationNumber: vendor.registrationNumber, expiryDate: '2030-01-01', status: 'ACTIVE' });
  const created = await api<Vendor>(`/api/vendors/${vendor.id}/site-mobilisations`, 'POST', { siteName: 'Selangor Yard', personnelIds: ['worker-site-1'] });
  assert.equal(created.status, 201);
  const siteId = created.data.siteMobilisations![0].id;
  assert.equal((await api<{ error: string }>(`/api/vendors/${vendor.id}/site-mobilisations/${siteId}/decision`, 'POST', { decision: 'APPROVED', notes: 'Induction checked' })).status, 400);
  const linked = await api<Vendor>(`/api/vendors/${vendor.id}/site-mobilisations/${siteId}`, 'PATCH', { personnelIds: ['worker-site-1'], inductionDocumentIds: { 'worker-site-1': 'induction-site-1' } });
  assert.equal(linked.status, 200);
  const approved = await api<Vendor>(`/api/vendors/${vendor.id}/site-mobilisations/${siteId}/decision`, 'POST', { decision: 'APPROVED', notes: 'Named roster and induction verified' });
  assert.equal(approved.status, 200);
  assert.equal((await api<Vendor>(`/api/vendors/${vendor.id}`)).data.siteMobilisations?.[0].readinessStatus, 'APPROVED');
  const added = await api<Vendor>(`/api/vendors/${vendor.id}/personnel`, 'POST', { name: 'Worker Two', role: 'SITE_WORKER', siteAssignment: 'Selangor Yard' });
  assert.equal(added.status, 201);
  assert.equal((await api<Vendor>(`/api/vendors/${vendor.id}`)).data.siteMobilisations?.[0].readinessStatus, 'BLOCKED');
  assert.ok((await vendorStore.vendor(vendor.id))?.auditTrail.some(event => event.type === 'SITE_MOBILISATION_DECIDED'));
});

test('vendor annual performance requires measured events and freezes the review evidence', async () => {
  const vendor = (await vendorStore.vendor('vendor-site-test'))!;
  const route = `/api/vendors/${vendor.id}`;
  assert.equal((await api<{ error: string }>(`${route}/performance-events`, 'POST', { metric: 'delivery', kind: 'KPI', title: 'On-time delivery', occurredOn: '2026-09-01' })).status, 400);
  const event = await api<{ id: string }>(`${route}/performance-events`, 'POST', { metric: 'delivery', kind: 'KPI', title: 'On-time delivery', occurredOn: '2026-09-01', siteName: 'Selangor Yard', observedValue: 92, targetValue: 95, unit: '%', notes: 'Measured from monthly delivery log', documentIds: ['induction-site-1'] });
  assert.equal(event.status, 201);
  const scores = { quality: 80, delivery: 90, cost: 80, service: 80, safety: 80, compliance: 80 };
  const weights = { quality: 20, delivery: 20, cost: 15, service: 15, safety: 15, compliance: 15 };
  assert.equal((await api<{ error: string }>(`${route}/performance`, 'POST', { period: '2026', scores, weights, comments: 'Reviewed' })).status, 400);
  assert.equal((await api<{ error: string }>(`${route}/performance`, 'POST', { period: '2026', scores: { ...scores, safety: 'not a score' }, weights, eventIds: [event.data.id] })).status, 400);
  const review = await api<{ eventSnapshot: Array<{ notes: string }>; weightedScore: number }>(`${route}/performance`, 'POST', { period: '2026', scores, weights, eventIds: [event.data.id], comments: 'Assessed against monthly log' });
  assert.equal(review.status, 201);
  assert.equal(review.data.eventSnapshot[0].notes, 'Measured from monthly delivery log');
  assert.equal(review.data.weightedScore, 82);
  assert.equal((await api<Vendor>(`${route}/performance-events/${event.data.id}`, 'PATCH', { notes: 'Corrected source description' })).status, 200);
  assert.equal((await vendorStore.vendor(vendor.id))?.performanceAssessments[0].eventSnapshot?.[0].notes, 'Measured from monthly delivery log');
});

test('vendor document-first intake persists originals, allows manual fallback and commits once', async () => {
  const created = await api<VendorIntakeCase>('/api/vendor-intakes', 'POST', { entityId: 'entity-axcelasia-builders' });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.deepEqual((await ownerApi<VendorIntakeCase[]>('/api/vendor-intakes', 'owner@example.test')).data, [], 'owners must not see unfinished intake drafts');
  assert.equal((await ownerApi<{ error: string }>(`/api/vendor-intakes/${id}`, 'owner@example.test')).status, 404);
  const document = Buffer.from('SSM company profile for Intake Supplier Sdn Bhd');
  const uploaded = await api<VendorIntakeCase>(`/api/vendor-intakes/${id}/files`, 'POST', { file: { fileName: 'ssm-profile.txt', mimeType: 'text/plain', data: document.toString('base64') } });
  assert.equal(uploaded.status, 201);
  assert.equal((await api<VendorIntakeCase>(`/api/vendor-intakes/${id}/process`, 'POST', {})).status, 202);
  let intake: VendorIntakeCase | undefined;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    intake = (await api<VendorIntakeCase>(`/api/vendor-intakes/${id}`)).data;
    if (['PARTIAL', 'READY_FOR_REVIEW', 'FAILED'].includes(intake.stage)) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(intake?.stage, 'PARTIAL', 'missing AI key must leave a visible manual-review case');
  assert.equal(intake.documents[0].status, 'REVIEW_REQUIRED');
  const original = await fetch(`${base}/api/vendor-intakes/${id}/files/${intake.documents[0].id}`);
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), document);
  assert.equal((await ownerApi<{ error: string }>(`/api/vendor-intakes/${id}/files/${intake.documents[0].id}`, 'owner@example.test')).status, 404);
  const committed = await api<{ vendor: Vendor; job: { id: string; vendorId: string } }>(`/api/vendor-intakes/${id}/commit`, 'POST', { entityId: 'entity-axcelasia-builders', legalName: 'Intake Supplier Sdn Bhd', registrationNumber: '202601234500', categoryId: 'other-vendor', services: ['Materials supply'], activityTags: [], personnel: [] });
  assert.equal(committed.status, 201);
  assert.equal(committed.data.vendor.documents.length, 1);
  assert.equal(committed.data.job.vendorId, committed.data.vendor.id);
  assert.deepEqual(await readFile(vendorStore.absoluteUploadPath(committed.data.vendor.documents[0].storagePath)), document);
  const downloaded = await fetch(`${base}/api/vendors/${committed.data.vendor.id}/documents/${committed.data.vendor.documents[0].id}/download`);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), document);
  const preview = await fetch(`${base}/api/vendors/${committed.data.vendor.id}/documents/${committed.data.vendor.documents[0].id}/preview`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type') || '', /text\/plain/);
  assert.match(await preview.text(), /SSM company profile/);
  assert.equal(preview.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await api<VendorIntakeCase>(`/api/vendor-intakes/${id}`)).data.stage, 'COMMITTED');
  assert.equal((await api<{ error: string }>(`/api/vendor-intakes/${id}/commit`, 'POST', { entityId: 'entity-axcelasia-builders' })).status, 400);
  let finished = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const job = await vendorStore.job(committed.data.job.id);
    if (job && ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.stage)) { finished = true; break; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(finished, 'Vendor verification did not finish before test teardown.');
  const projected = (await api<Vendor>(`/api/vendors/${committed.data.vendor.id}`)).data;
  assert.equal(projected.recommendation, 'AWAITING_EVIDENCE');
  assert.ok(projected.requirementResults.some(result => result.status === 'PENDING_EVIDENCE'));
  assert.ok(!projected.requirementResults.some(result => result.status === 'FAILED' && !result.evidenceIds.length));
});

test('source-linked high vendor risk creates owner work and blocks approval until a human decision', async () => {
  const id = 'vendor-contract-test';
  const event = await api<{ id: string }>(`/api/vendors/${id}/performance-events`, 'POST', { metric: 'safety', kind: 'INCIDENT', title: 'Unsafe lift operation', occurredOn: '2026-09-01', notes: 'Site supervisor incident log' });
  assert.equal(event.status, 201);
  assert.equal((await api<{ error: string }>(`/api/vendors/${id}/risk-cases`, 'POST', { category: 'SAFETY', severity: 'HIGH', title: 'Lift operation concern', findings: 'Review incident before mobilisation.' })).status, 400);
  const created = await api<VendorRiskCase>(`/api/vendors/${id}/risk-cases`, 'POST', { category: 'SAFETY', severity: 'HIGH', title: 'Lift operation concern', findings: 'Review incident before mobilisation.', sourceEventIds: [event.data.id], ownerEmail: 'owner@example.test', dueDate: '2026-10-01' });
  assert.equal(created.status, 201);
  const projected = (await api<Vendor>(`/api/vendors/${id}`)).data;
  assert.equal(projected.recommendation, 'NEEDS_REVIEW');
  assert.match(projected.recommendationSummary, /risk case/);
  assert.equal(projected.onboardingStatus, 'APPROVED', 'existing human approval is not silently revoked');
  assert.ok(projected.followUps.some(item => item.riskCaseId === created.data.id && item.owner === 'owner@example.test'));
  const siteVendor = (await vendorStore.vendor('vendor-site-test'))!;
  siteVendor.personnel = siteVendor.personnel.filter(item => item.id === 'worker-site-1');
  assert.equal(assessSiteReadiness(siteVendor, siteVendor.siteMobilisations![0]).status, 'APPROVED');
  siteVendor.riskCases = [created.data];
  assert.equal(assessSiteReadiness(siteVendor, siteVendor.siteMobilisations![0]).status, 'BLOCKED');
  assert.equal((await api<{ error: string }>(`/api/vendors/${id}/approval`, 'POST', { decision: 'APPROVED' })).status, 400);
  assert.equal((await api<{ error: string }>(`/api/vendors/${id}/risk-cases/${created.data.id}/decision`, 'POST', { decision: 'DISMISSED' })).status, 400);
  const decided = await api<Vendor>(`/api/vendors/${id}/risk-cases/${created.data.id}/decision`, 'POST', { decision: 'MITIGATED', reason: 'Corrective training and supervisor sign-off reviewed.' });
  assert.equal(decided.status, 200);
  assert.equal(decided.data.riskCases?.[0].status, 'MITIGATED');
  assert.equal(decided.data.followUps.find(item => item.riskCaseId === created.data.id)?.status, 'COMPLETED');
  assert.ok(decided.data.auditTrail.some(item => item.type === 'RISK_CASE_DECIDED'));
});

test('asset operator links enforce same entity and current personnel competency', async () => {
  const template = { id: 'vendor-linked-machine', entityId: 'entity-axcelasia-builders', name: 'Crane A', registrationNumber: 'CRANE-VENDOR-TEST', category: 'HEAVY_MACHINERY', brand: '', model: '', year: 2026, ownership: 'OWNED', purchaseDate: '', purchaseCost: 0, image: '', location: { siteId: '', name: 'Selangor Yard', type: '', coordinates: { lat: 0, lng: 0 }, lastUpdated: '', status: 'UNVERIFIED' }, assignedDrivers: [], documents: {}, maintenance: { lastServiceDate: '', nextServiceDate: '', records: [] } } as const;
  await assetStore.createAsset(structuredClone(template) as any, 'Test Admin');
  const route = '/api/vendors/vendor-site-test/entity-links';
  const input = { entityType: 'ASSET', entityId: template.id, entityName: 'Crane A', relationship: 'OPERATOR', personnelId: 'worker-site-1' };
  assert.equal((await api<{ error: string }>(route, 'POST', { ...input, entityId: 'missing-machine' })).status, 400);
  const vendor = (await vendorStore.vendor('vendor-site-test'))!;
  vendor.requirementResults.find(item => item.subjectId === 'worker-site-1')!.expiresAt = '2020-01-01';
  await vendorStore.saveVendor(vendor);
  assert.equal((await api<{ error: string }>(route, 'POST', input)).status, 400);
  vendor.requirementResults.find(item => item.subjectId === 'worker-site-1')!.expiresAt = '2030-01-01';
  await vendorStore.saveVendor(vendor);
  assert.equal((await api<Vendor>(route, 'POST', input)).status, 201);
  assert.equal((await api<Vendor>(route, 'POST', input)).data.entityLinks.filter(item => item.entityId === template.id && item.relationship === 'OPERATOR').length, 1);
});
