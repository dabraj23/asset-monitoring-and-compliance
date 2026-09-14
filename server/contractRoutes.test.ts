import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Contract, ContractJob, ContractObligation } from '../src/contractTypes.ts';

const storage = await mkdtemp(path.join(os.tmpdir(), 'contract-api-test-'));
process.env.CONTRACT_DATA_DIR = storage;
process.env.VENDOR_DATA_DIR = path.join(storage, 'vendors');
process.env.PLATFORM_DATA_DIR = path.join(storage, 'platform');
delete process.env.GEMINI_API_KEY;
const { registerContractRoutes } = await import('./contractRoutes.ts');
const { contractStore } = await import('./contractStore.ts');
const { registerWorkRoutes } = await import('./workRoutes.ts');
const app = express();
app.use(express.json({ limit: '30mb' }));
app.use((request, _response, next) => { (request as any).platformUser = request.headers['x-test-user'] === 'owner' ? { id: 'owner', name: 'Finance Owner', email: 'finance@example.test', role: 'OWNER', entityIds: ['entity-axcelasia-builders'] } : request.headers['x-test-user'] === 'other' ? { id: 'other', name: 'Other Owner', email: 'other@example.test', role: 'OWNER', entityIds: ['entity-axcelasia-builders'] } : { id: 'admin', name: 'Test Admin', email: 'admin@example.test', role: 'GROUP_ADMIN', entityIds: [] }; next(); });
await registerContractRoutes(app);
registerWorkRoutes(app);
const server = await new Promise<Server>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(storage, { recursive: true, force: true }); });

const api = async <T>(route: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json() as T;
  return { status: response.status, data };
};
const file = (name: string, documentType: string, signed: boolean) => ({ fileName: name, mimeType: 'text/plain', data: Buffer.from(`${name}\nExecuted by both parties.`).toString('base64'), documentType, signed, authoritative: documentType === 'SIGNED_CONTRACT' });
const awaitJob = async (id: string) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { data } = await api<ContractJob>(`/api/contract-jobs/${id}`);
    if (['COMPLETED', 'PARTIAL', 'FAILED'].includes(data.stage)) return data;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for contract intelligence job.');
};

test('signed intake, manual fallback, chained renewal and document review work end to end', async () => {
  const intake = await api<{ contract: Contract; job: ContractJob }>('/api/contracts/smart-files', 'POST', {
    contract: { title: 'API flow contract', contractType: 'Other', primaryEntityId: 'entity-axcelasia-builders', principalActivity: 'Facilities management', counterpartyName: 'Test Supplier Sdn Bhd', expiryDate: '2027-09-30' },
    files: [file('signed-agreement.txt', 'SIGNED_CONTRACT', true)],
  });
  assert.equal(intake.status, 202);
  const id = intake.data.contract.id;
  assert.equal((await awaitJob(intake.data.job.id)).stage, 'PARTIAL');
  const initial = (await api<Contract>(`/api/contracts/${id}`)).data;
  assert.equal(initial.documents[0].extractionStatus, 'REVIEW_REQUIRED');

  const clause = await api<{ id: string }>(`/api/contracts/${id}/clauses`, 'POST', {
    clauseNumber: '9', heading: 'Termination', clauseType: 'Termination', sourceText: 'Either party may terminate on 60 days written notice.', sourceReference: 'Page 3, clause 9',
  });
  assert.equal(clause.status, 201);
  const signoff = await api<Contract>(`/api/contracts/${id}/documents/${initial.documents[0].id}/manual-review`, 'POST', { rationale: 'Compared page 3 with original signed copy.' });
  assert.equal(signoff.status, 200);
  assert.equal(signoff.data.documents[0].extractionStatus, 'COMPLETED');

  const first = await api<ContractObligation>(`/api/contracts/${id}/obligations`, 'POST', { clauseId: clause.data.id, title: 'Approve renewal terms', action: 'Review renewal terms with Legal', dueDate: '2026-09-20', recurrence: 'ONCE' });
  assert.equal(first.status, 201);
  const successor = await api<ContractObligation>(`/api/contracts/${id}/obligations`, 'POST', { clauseId: clause.data.id, title: 'Store renewal', action: 'Upload approved signed renewal', predecessorId: first.data.id, triggerOffsetDays: 14, actionKind: 'UPLOAD_RENEWAL', recurrence: 'ONCE' });
  assert.equal(successor.status, 201);
  assert.equal(successor.data.status, 'WAITING');
  assert.equal((await api<Contract>(`/api/contracts/${id}/activate`, 'POST')).status, 200);

  const upload = await api<ContractJob>(`/api/contracts/${id}/documents`, 'POST', { files: [file('renewal.txt', 'RENEWAL', false)] });
  assert.equal(upload.status, 202);
  await awaitJob(upload.data.id);
  const pending = (await api<Contract>(`/api/contracts/${id}`)).data;
  const renewal = pending.documents.find(item => item.documentType === 'RENEWAL')!;
  assert.equal(pending.status, 'RENEWAL_REVIEW');
  assert.equal(pending.expiryDate, '2027-09-30');
  assert.equal(renewal.changeReviewStatus, 'PENDING');
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/documents/${renewal.id}/change-review`, 'POST', { decision: 'ACCEPTED', rationale: 'Reviewed against agreement.' })).status, 400);
  assert.equal((await api<Contract>(`/api/contracts/${id}/documents/${renewal.id}`, 'PATCH', { signed: true })).status, 200);
  const accepted = await api<Contract>(`/api/contracts/${id}/documents/${renewal.id}/change-review`, 'POST', { decision: 'ACCEPTED', rationale: 'Executed copy checked; no date change stated.' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.documents.find(item => item.id === renewal.id)?.changeReviewStatus, 'ACCEPTED');
  assert.equal(accepted.data.expiryDate, '2027-09-30');

  const completed = await api<Contract>(`/api/contracts/${id}/obligations/${first.data.id}/complete`, 'POST', { evidence: 'Legal approval recorded.' });
  assert.equal(completed.status, 200);
  assert.notEqual(completed.data.obligations.find(item => item.id === successor.data.id)?.status, 'WAITING');
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/obligations/${successor.data.id}/complete`, 'POST', { evidence: 'Done' })).status, 400);
  const final = await api<Contract>(`/api/contracts/${id}/obligations/${successor.data.id}/complete`, 'POST', { evidence: 'Executed renewal stored.', linkedDocumentId: renewal.id });
  assert.equal(final.status, 200);
  assert.equal(final.data.obligations.find(item => item.id === successor.data.id)?.status, 'COMPLETED');
  assert.ok(final.data.auditTrail.some(item => item.type === 'LIFECYCLE_CHANGE_ACCEPTED'));
});

test('group-admin signed intake can begin with files before entity and counterparty are known', async () => {
  const intake = await api<{ contract: Contract; job: ContractJob }>('/api/contracts/smart-files', 'POST', {
    contract: { title: 'Unknown-entity signed bundle', contractType: 'Other', primaryEntityId: '' },
    files: [file('unclassified-signed-contract.txt', 'SIGNED_CONTRACT', true)],
  });
  assert.equal(intake.status, 202);
  assert.equal(intake.data.contract.primaryEntityId, '');
  assert.equal(intake.data.contract.counterpartyName, '');
  assert.equal((await awaitJob(intake.data.job.id)).stage, 'PARTIAL');
  const contract = (await api<Contract>(`/api/contracts/${intake.data.contract.id}`)).data;
  assert.equal(contract.documents.length, 1);
  assert.notEqual(contract.status, 'ACTIVE');
});

test('new drafting follows the configured staged approval matrix', async () => {
  const draft = await api<Contract>('/api/contracts/drafts', 'POST', {
    title: 'New service contract', contractType: 'Service Agreement', primaryEntityId: 'entity-axcelasia-builders', principalActivity: 'Facilities management',
    counterpartyName: 'Another Supplier Sdn Bhd', value: 200000, currency: 'MYR', templateId: 'services-standard',
  });
  assert.equal(draft.status, 201);
  assert.ok(draft.data.draftContent.includes('Another Supplier Sdn Bhd'));
  const id = draft.data.id;
  const submitted = await api<Contract>(`/api/contracts/${id}/submit-review`, 'POST', { notes: 'Ready for approval.' });
  assert.equal(submitted.data.status, 'APPROVAL_PENDING');
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/ai-draft`, 'POST', { instruction: 'Change commercial terms' })).status, 400);
  const expected = ['Business Review', 'Legal Review', 'Finance Review', 'Approval Authority'];
  for (let index = 0; index < expected.length; index += 1) {
    const decision = await api<Contract>(`/api/contracts/${id}/approval`, 'POST', { decision: 'APPROVED', notes: `${expected[index]} checked.` });
    assert.equal(decision.status, 200);
    assert.equal(decision.data.approvals.at(-1)?.stage, expected[index]);
    assert.equal(decision.data.status, index === expected.length - 1 ? 'APPROVED' : 'APPROVAL_PENDING');
  }
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/approval`, 'POST', { decision: 'APPROVED' })).status, 400);
});

test('contract payments require settlement evidence and a separate manual reconciliation', async () => {
  const draft = await api<Contract>('/api/contracts/drafts', 'POST', {
    title: 'Payment schedule test', contractType: 'Service Agreement', primaryEntityId: 'entity-axcelasia-builders',
    counterpartyName: 'Milestone Contractor Sdn Bhd', templateId: 'services-standard',
  });
  assert.equal(draft.status, 201);
  const id = draft.data.id;
  const invalid = await api<{ error: string }>(`/api/contracts/${id}/payments`, 'POST', { title: 'Invalid', direction: 'PAYABLE', amount: -10, dueDate: '2026-12-01', ownerName: 'Finance', ownerEmail: 'finance@example.test' });
  assert.equal(invalid.status, 400);
  const created = await api<{ id: string; status: string }>(`/api/contracts/${id}/payments`, 'POST', { title: 'First progress claim', direction: 'PAYABLE', amount: 12500, dueDate: '2027-12-01', ownerName: 'Finance', ownerEmail: 'finance@example.test' });
  assert.equal(created.status, 201);
  const paymentId = created.data.id;
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/payments/${paymentId}/reconcile`, 'POST', { reference: 'BANK-123', note: 'Checked' })).status, 400);
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/payments/${paymentId}/decision`, 'POST', { decision: 'SETTLED' })).status, 400);
  const settled = await api<Contract>(`/api/contracts/${id}/payments/${paymentId}/decision`, 'POST', { decision: 'SETTLED', evidence: 'Payment receipt reviewed' });
  assert.equal(settled.status, 200);
  assert.equal(settled.data.paymentMilestones?.[0].reconciliationStatus, 'PENDING');
  const reconciled = await api<Contract>(`/api/contracts/${id}/payments/${paymentId}/reconcile`, 'POST', { reference: 'BANK-123', note: 'Matched amount and counterparty manually' });
  assert.equal(reconciled.status, 200);
  assert.equal(reconciled.data.paymentMilestones?.[0].reconciliationStatus, 'RECONCILED');
  assert.ok(reconciled.data.auditTrail.some(event => event.type === 'PAYMENT_RECONCILED'));
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/payments/${paymentId}`, 'PATCH', { amount: 9000 })).status, 400);
});

test('payment owner sees assigned work, attaches evidence and reports settlement before admin reconciliation', async () => {
  const draft = await api<Contract>('/api/contracts/drafts', 'POST', { title: 'Owner payment flow', contractType: 'Service Agreement', primaryEntityId: 'entity-axcelasia-builders', counterpartyName: 'Supplier', templateId: 'services-standard' });
  assert.equal(draft.status, 201);
  const created = await api<{ id: string }>(`/api/contracts/${draft.data.id}/payments`, 'POST', { title: 'Monthly service fee', direction: 'PAYABLE', amount: 500, dueDate: '2027-12-01', ownerName: 'Finance Owner', ownerEmail: 'finance@example.test' });
  assert.equal(created.status, 201);
  const prefix = `${base}/api/my-work/contracts/${draft.data.id}/payments/${created.data.id}`;
  const ownerPost = async (route: string, body: unknown, user = 'owner') => fetch(`${prefix}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, body: JSON.stringify(body) });
  const myWork = await fetch(`${base}/api/my-work`, { headers: { 'x-test-user': 'owner' } });
  assert.equal(myWork.status, 200);
  assert.ok(((await myWork.json()) as Array<{ id: string; type: string }>).some(item => item.id === created.data.id && item.type === 'PAYMENT'));
  assert.equal((await ownerPost('settle', {})).status, 400);
  assert.equal((await ownerPost('progress', { note: 'Receipt requested' }, 'other')).status, 404);
  const evidence = await ownerPost('evidence', { fileName: 'receipt.txt', mimeType: 'text/plain', data: Buffer.from('Bank receipt').toString('base64') });
  assert.equal(evidence.status, 201);
  const evidenceId = ((await evidence.json()) as { id: string }).id;
  assert.equal((await fetch(`${base}/api/my-work/evidence/${evidenceId}`, { headers: { 'x-test-user': 'other' } })).status, 404);
  assert.equal((await ownerPost('settle', { note: 'Receipt uploaded for review' })).status, 200);
  const pending = (await api<Contract>(`/api/contracts/${draft.data.id}`)).data.paymentMilestones![0];
  assert.equal(pending.reconciliationStatus, 'PENDING');
  assert.equal(pending.status, 'SETTLED');
  assert.equal((await api<Contract>(`/api/contracts/${draft.data.id}/payments/${created.data.id}/reconcile`, 'POST', { reference: 'LEDGER-12', note: 'Receipt matched manually' })).status, 200);
});

test('close-out preserves open work, supports cancellation and requires explicit resolution', async () => {
  const draft = await api<Contract>('/api/contracts/drafts', 'POST', { title: 'Close-out control test', contractType: 'Service Agreement', primaryEntityId: 'entity-axcelasia-builders', counterpartyName: 'Supplier', templateId: 'services-standard' });
  assert.equal(draft.status, 201);
  const id = draft.data.id;
  const seeded = (await contractStore.contract(id))!; seeded.status = 'ACTIVE'; await contractStore.saveContract(seeded);
  const clause = await api<{ id: string }>(`/api/contracts/${id}/clauses`, 'POST', { clauseNumber: '7', heading: 'Monthly reporting', sourceText: 'Submit monthly reports.' });
  const obligation = await api<ContractObligation>(`/api/contracts/${id}/obligations`, 'POST', { clauseId: clause.data.id, title: 'Submit final report', action: 'Provide report', dueDate: '2027-09-01' });
  assert.equal(obligation.status, 201);
  const payment = await api<{ id: string }>(`/api/contracts/${id}/payments`, 'POST', { title: 'Final fee', direction: 'PAYABLE', amount: 100, dueDate: '2027-09-01', ownerName: 'Finance', ownerEmail: 'finance@example.test' });
  assert.equal(payment.status, 201);
  const start = await api<Contract>(`/api/contracts/${id}/closeout`, 'POST', { kind: 'EXPIRY', effectiveDate: '2027-09-30', reason: 'Agreement expires without renewal.' });
  assert.equal(start.status, 200);
  assert.equal(start.data.obligations.find(item => item.id === obligation.data.id)?.status, obligation.data.status);
  assert.equal(start.data.paymentMilestones?.[0].status, 'OPEN');
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/closeout/approve`, 'POST')).status, 400);
  const cancelled = await api<Contract>(`/api/contracts/${id}/closeout/cancel`, 'POST', { rationale: 'Renewal decision still pending.' });
  assert.equal(cancelled.data.status, 'ACTIVE');
  assert.equal(cancelled.data.closeout, undefined);
  assert.equal((await api<Contract>(`/api/contracts/${id}/closeout`, 'POST', { kind: 'EXPIRY', effectiveDate: '2027-09-30', reason: 'Final expiry confirmed.' })).status, 200);
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/obligations/${obligation.data.id}/waive`, 'POST', {})).status, 400);
  assert.equal((await api<Contract>(`/api/contracts/${id}/obligations/${obligation.data.id}/waive`, 'POST', { rationale: 'Final report formally waived by entity owner.' })).status, 200);
  assert.equal((await api<Contract>(`/api/contracts/${id}/payments/${payment.data.id}/decision`, 'POST', { decision: 'WAIVED', evidence: 'Final fee waived by written agreement.' })).status, 200);
  const closed = await api<Contract>(`/api/contracts/${id}/closeout/approve`, 'POST');
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, 'CLOSED');
  assert.ok(closed.data.auditTrail.some(item => item.type === 'OBLIGATION_WAIVED'));
});

test('contract review comments and explicit clause supersession produce consolidated current terms', async () => {
  const draft = await api<Contract>('/api/contracts/drafts', 'POST', { title: 'Amendment review test', contractType: 'Service Agreement', primaryEntityId: 'entity-axcelasia-builders', counterpartyName: 'Service Partner', templateId: 'services-standard' });
  assert.equal(draft.status, 201);
  const id = draft.data.id;
  const prior = await api<{ id: string }>(`/api/contracts/${id}/clauses`, 'POST', { clauseNumber: '4', heading: 'Service fee', sourceText: 'Fee is RM 1,000 per month.' });
  assert.equal(prior.status, 201);
  const record = (await contractStore.contract(id))!;
  record.documents.push({ id: 'accepted-fee-amendment', fileName: 'Fee addendum.pdf', mimeType: 'application/pdf', size: 100, sha256: 'test', version: 2, documentType: 'ADDENDUM', authoritative: true, signed: true, uploadedAt: new Date().toISOString(), extractionStatus: 'COMPLETED', changeReviewStatus: 'ACCEPTED', storagePath: 'seed/amendment.pdf' });
  record.clauses.push({ ...record.clauses.find(item => item.id === prior.data.id)!, id: 'replacement-fee-clause', sourceDocumentId: 'accepted-fee-amendment', sourceText: 'Fee is RM 1,200 per month.', reviewStatus: 'CONFIRMED' });
  await contractStore.saveContract(record);
  const before = await api<{ clauses: Array<{ id: string }>; unresolvedOverlaps: string[] }>(`/api/contracts/${id}/current-terms`);
  assert.equal(before.data.clauses.length, 2);
  assert.deepEqual(before.data.unresolvedOverlaps, ['4']);
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/clauses/replacement-fee-clause/supersede`, 'POST', { priorClauseId: prior.data.id })).status, 400);
  const decided = await api<Contract>(`/api/contracts/${id}/clauses/replacement-fee-clause/supersede`, 'POST', { priorClauseId: prior.data.id, rationale: 'Executed fee addendum replaces clause 4.' });
  assert.equal(decided.status, 200);
  const current = await api<{ clauses: Array<{ id: string }>; unresolvedOverlaps: string[] }>(`/api/contracts/${id}/current-terms`);
  assert.deepEqual(current.data.clauses.map(item => item.id), ['replacement-fee-clause']);
  assert.deepEqual(current.data.unresolvedOverlaps, []);
  const comment = await api<{ id: string }>(`/api/contracts/${id}/comments`, 'POST', { targetType: 'CLAUSE', targetId: 'replacement-fee-clause', text: 'Confirm the revised amount with Finance.' });
  assert.equal(comment.status, 201);
  assert.equal((await api<{ error: string }>(`/api/contracts/${id}/comments`, 'POST', { targetType: 'CLAUSE', targetId: 'another-contract-clause', text: 'Wrong target' })).status, 400);
  const resolved = await api<Contract>(`/api/contracts/${id}/comments/${comment.data.id}/resolve`, 'POST', { resolution: 'Finance confirmed the signed schedule.' });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.data.comments?.[0].status, 'RESOLVED');
});

test('Word and PDF contracts can be staged as one 25-file background batch', async () => {
  const first = await api<{ contract: Contract; documentId: string }>('/api/contracts/smart-files/start', 'POST', {
    contract: { title: 'Bulk contract bundle', contractType: 'Other' },
    file: { ...file('agreement.doc', 'SIGNED_CONTRACT', true), mimeType: 'application/msword' },
  });
  assert.equal(first.status, 201);
  const documentIds = [first.data.documentId];
  for (let index = 1; index < 25; index += 1) {
    const word = index === 1;
    const staged = await api<{ documentId: string }>(`/api/contracts/${first.data.contract.id}/documents/stage`, 'POST', {
      file: { ...file(`schedule-${index}.${word ? 'docx' : 'pdf'}`, 'SUPPORTING_DOCUMENT', false), mimeType: word ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' },
    });
    assert.equal(staged.status, 201, JSON.stringify({ index, data: staged.data }));
    documentIds.push(staged.data.documentId);
  }
  const tooMany = await api<{ error: string }>(`/api/contracts/${first.data.contract.id}/documents/process`, 'POST', { documentIds: [...documentIds, 'extra'] });
  assert.equal(tooMany.status, 400);
  const started = await api<ContractJob>(`/api/contracts/${first.data.contract.id}/documents/process`, 'POST', { documentIds });
  assert.equal(started.status, 202);
  assert.equal(started.data.documentIds.length, 25);
  const finished = await awaitJob(started.data.id);
  assert.equal(finished.stage, 'PARTIAL', finished.error);
  const contract = (await api<Contract>(`/api/contracts/${first.data.contract.id}`)).data;
  assert.equal(contract.documents.length, 25);
  assert.equal(contract.documents[0].mimeType, 'application/msword');
  assert.equal(contract.documents[0].extractionStatus, 'REVIEW_REQUIRED');
  assert.equal(contract.documents[1].mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(contract.documents[24].mimeType, 'application/pdf');
  assert.equal((await api<{ error: string }>(`/api/contracts/${contract.id}/documents`, 'POST', { files: Array.from({ length: 26 }, (_, index) => file(`overflow-${index}.txt`, 'SUPPORTING_DOCUMENT', false)) })).status, 400);
});
