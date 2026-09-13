import assert from 'node:assert/strict';
import test from 'node:test';
import type { Contract, ContractClause, ContractObligation } from '../src/contractTypes.ts';
import {
  buildContractDashboard,
  calculateNoticeDeadline,
  completeObligation,
  createObligationFromClause,
  createSeedConfiguration,
  createSeedContracts,
  createSeedEntities,
  deriveOwners,
  evaluateContractAgainstPlaybook,
  resolveEntity,
  releaseDependentObligations,
  validateActivation,
  validateObligationDependency,
} from './contractEngine.ts';

test('entity resolver prioritises exact registration number and understands aliases', () => {
  const entities = createSeedEntities();
  const exact = resolveEntity(entities, { legalName: 'Wrong Name', registrationNumber: '202001019876' });
  assert.equal(exact?.entityId, 'entity-axcelasia-builders');
  assert.equal(exact?.confidence, 1);
  const alias = resolveEntity(entities, { legalName: 'LSHBB' });
  assert.equal(alias?.entityId, 'entity-axcelasia-builders');
  assert.ok((alias?.confidence || 0) >= 0.9);
});

test('entity ownership inherits group legal and uses local monitoring roles', () => {
  const entities = createSeedEntities();
  const owners = deriveOwners(entities, 'entity-axcelasia-builders', 'Facilities management');
  assert.equal(owners.contractOwnerName, 'Amir Hakim');
  assert.equal(owners.monitoringOwnerName, 'Siti Amina');
  assert.equal(owners.legalOwnerName, 'Aisha Rahman');
});

test('notice deadline is calculated from expiry and contractual notice period', () => {
  assert.equal(calculateNoticeDeadline('2027-01-31', 60), '2026-12-02');
});

test('activation blocks unconfirmed material clauses and unassigned obligations', () => {
  const entities = createSeedEntities();
  const contract = createSeedContracts(entities)[0];
  contract.clauses[0].reviewStatus = 'AI_EXTRACTED';
  contract.obligations[0].monitoringOwnerEmail = '';
  const gaps = validateActivation(contract);
  assert.ok(gaps.some(gap => /material clauses/i.test(gap)));
  assert.ok(gaps.some(gap => /accountable and monitoring owner/i.test(gap)));
});

test('activation requires an authoritative signed version with completed intelligence', () => {
  const contract = createSeedContracts(createSeedEntities())[0];
  contract.documents = [];
  assert.ok(validateActivation(contract).some(gap => /authoritative signed document/i.test(gap)));
  contract.documents = [{ id: 'd1', fileName: 'signed.pdf', mimeType: 'application/pdf', size: 1, sha256: 'x', version: 1, documentType: 'SIGNED_CONTRACT', authoritative: true, signed: true, uploadedAt: new Date().toISOString(), extractionStatus: 'REVIEW_REQUIRED', storagePath: 'x' }];
  assert.ok(validateActivation(contract).some(gap => /contract-intelligence review/i.test(gap)));
});

test('clause commitments become entity-owned obligations', () => {
  const entities = createSeedEntities();
  const contract = createSeedContracts(entities)[0];
  const clause: ContractClause = {
    id: 'c1', clauseNumber: '9', heading: 'Annual licence evidence', clauseType: 'Compliance',
    sourceText: 'Supplier must provide renewed licence evidence annually.', sourceReference: 'page 9', risk: 'HIGH', deviation: '',
    applicableEntityIds: [contract.primaryEntityId], responsibleParty: 'COUNTERPARTY', confidence: 0.95, reviewStatus: 'CONFIRMED', material: true,
  };
  const obligation = createObligationFromClause(clause, contract, entities, { recurrence: 'ANNUALLY', nextDueDate: '2099-01-01' });
  assert.equal(obligation.entityId, contract.primaryEntityId);
  assert.equal(obligation.monitoringOwnerName, 'Siti Amina');
  assert.equal(obligation.escalationOwnerName, 'Aisha Rahman');
});

test('playbook creates review issues for missing mandatory clauses and red-flag language', () => {
  const entities = createSeedEntities();
  const contract = createSeedContracts(entities)[0];
  const configuration = createSeedConfiguration();
  contract.clauses.push({
    id: 'liability-red-flag', clauseNumber: '12', heading: 'Liability', clauseType: 'Liability',
    sourceText: 'The Company accepts unlimited liability for all losses whatsoever.', sourceReference: 'page 12',
    risk: 'MEDIUM', deviation: '', applicableEntityIds: [contract.primaryEntityId], responsibleParty: 'OUR_COMPANY', confidence: 0.98, reviewStatus: 'CONFIRMED', material: true,
  });
  const issues = evaluateContractAgainstPlaybook(contract, configuration);
  assert.ok(issues.some(issue => issue.type === 'MISSING_REQUIRED_CLAUSE' && issue.title.includes('Termination')));
  assert.ok(issues.some(issue => issue.type === 'PLAYBOOK_DEVIATION' && issue.severity === 'CRITICAL'));
  assert.equal(contract.clauses.find(clause => clause.id === 'liability-red-flag')?.risk, 'CRITICAL');
});

test('recurring obligation completion creates the next monitoring cycle', () => {
  const obligation: ContractObligation = {
    id: 'o1', entityId: 'e1', responsibleParty: 'COUNTERPARTY', title: 'Monthly report', action: 'Review report',
    ownerName: 'Owner', ownerEmail: 'owner@example.com', monitoringOwnerName: 'Monitor', monitoringOwnerEmail: 'monitor@example.com',
    escalationOwnerName: 'Legal', recurrence: 'MONTHLY', nextDueDate: '2026-09-30', alertDays: [30, 7, 0], evidenceRequired: 'Report',
    blocking: false, trigger: 'IMMEDIATE', triggerOffsetDays: 0, actionKind: 'STANDARD', status: 'DUE_SOON', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const completed = completeObligation(obligation, 'September report accepted', '2026-09-29T00:00:00.000Z');
  assert.equal(completed.nextDueDate, '2026-10-30');
  assert.notEqual(completed.status, 'COMPLETED');
  assert.equal(completed.completionEvidence, 'September report accepted');
});

test('dashboard exposes overdue commitments and notification outbox entries', () => {
  const entities = createSeedEntities();
  const contract: Contract = createSeedContracts(entities)[0];
  contract.obligations[0].dueDate = '2026-08-01';
  contract.obligations[0].nextDueDate = undefined;
  contract.obligations[0].status = 'OPEN';
  const dashboard = buildContractDashboard([contract], createSeedConfiguration(), '2026-09-12');
  assert.ok(dashboard.overdueObligations >= 1);
  assert.ok(dashboard.notifications.some(item => item.severity === 'CRITICAL'));
  assert.ok(dashboard.outbox.some(item => item.to === contract.obligations[0].monitoringOwnerEmail));
});

test('completion releases a waiting successor at its configured offset', () => {
  const entities = createSeedEntities();
  const contract = createSeedContracts(entities)[0];
  const first = contract.obligations[0];
  first.status = 'OPEN'; first.recurrence = 'ONCE';
  const successor = createObligationFromClause(contract.clauses[0], contract, entities, {
    title: 'Upload renewed agreement', predecessorId: first.id, triggerOffsetDays: 14, actionKind: 'UPLOAD_RENEWAL', recurrence: 'ONCE',
  });
  assert.equal(successor.status, 'WAITING');
  const completed = completeObligation(first, 'Signed milestone receipt', '2026-09-13T00:00:00.000Z');
  const result = releaseDependentObligations([completed, successor], first.id, completed.completedAt);
  assert.deepEqual(result.releasedIds, [successor.id]);
  assert.equal(result.obligations[1].dueDate, '2026-09-27');
  assert.equal(result.obligations[1].status, 'DUE_SOON');
  assert.throws(() => completeObligation(successor, 'premature'), /not ready/);
});

test('obligation graph rejects missing and circular predecessors', () => {
  const entities = createSeedEntities();
  const contract = createSeedContracts(entities)[0];
  const first = contract.obligations[0];
  const second = createObligationFromClause(contract.clauses[0], contract, entities, { predecessorId: first.id });
  assert.throws(() => validateObligationDependency([first, second], first.id, second.id), /circular/);
  assert.throws(() => validateObligationDependency([first, second], second.id, 'elsewhere'), /does not belong/);
});

test('pending change documents and new draft obligations block activation', () => {
  const entities = createSeedEntities();
  const contract = createSeedContracts(entities)[0];
  contract.documents.push({ ...contract.documents[0], id: 'renewal', documentType: 'RENEWAL', authoritative: false, changeReviewStatus: 'PENDING' });
  contract.obligations.push({ ...contract.obligations[0], id: 'draft-successor', status: 'DRAFT' });
  const gaps = validateActivation(contract);
  assert.ok(gaps.some(gap => gap.includes('change-impact review')));
  assert.ok(gaps.some(gap => gap.includes('New obligations')));
});

test('draft contracts do not send live obligation or renewal alerts', () => {
  const entities = createSeedEntities();
  const contract = createSeedContracts(entities)[0];
  contract.status = 'DRAFT';
  contract.obligations[0].status = 'OPEN';
  contract.obligations[0].dueDate = '2026-09-13';
  const dashboard = buildContractDashboard([contract], createSeedConfiguration(), '2026-09-13');
  assert.equal(dashboard.activeContracts, 0);
  assert.equal(dashboard.notifications.length, 0);
  assert.equal(dashboard.outbox.length, 0);
});
