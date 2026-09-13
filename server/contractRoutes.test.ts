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
delete process.env.GEMINI_API_KEY;
const { registerContractRoutes } = await import('./contractRoutes.ts');
const app = express();
app.use(express.json({ limit: '30mb' }));
await registerContractRoutes(app);
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
