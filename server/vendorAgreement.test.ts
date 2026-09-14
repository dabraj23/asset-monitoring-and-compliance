import assert from 'node:assert/strict';
import test from 'node:test';
import type { Contract } from '../src/contractTypes.ts';
import type { Vendor } from '../src/vendorTypes.ts';
import { seededVendorRules } from './vendorEngine.ts';
import { eligibleVendorContracts, evaluateVendorAgreement } from './vendorAgreement.ts';

const rule = seededVendorRules.find(item => item.id === 'agreement')!;
const vendor = { id: 'v1', entityId: 'e1', legalName: 'Example Engineering', registrationNumber: '202001234567' } as Vendor;
const contract = {
  id: 'c1', vendorId: 'v1', primaryEntityId: 'e1', coveredEntityIds: ['e1'], counterpartyRegistrationNumber: '2020-01234567',
  status: 'ACTIVE', effectiveDate: '2025-01-01', expiryDate: '2027-12-31',
} as Contract;
const asOf = '2026-09-14';
const check = (item: Vendor = vendor, contracts: Contract[] = [contract]) => evaluateVendorAgreement(item, contracts, rule, asOf);

test('an active identity-matched contract satisfies the agreement requirement', () => {
  assert.equal(check().status, 'PASSED');
  assert.equal(check().sourceRecordId, 'c1');
});

test('an uploaded vendor document alone cannot satisfy the contract-owned requirement', () => {
  assert.equal(check({ ...vendor, documents: [{ documentType: 'VENDOR_AGREEMENT' }] } as Vendor, []).status, 'PENDING_EVIDENCE');
});

test('an agreement from another entity does not cross entity boundaries', () => {
  assert.equal(eligibleVendorContracts(vendor, [{ ...contract, primaryEntityId: 'e2', coveredEntityIds: ['e2'] }]).length, 0);
  assert.equal(check(vendor, [{ ...contract, primaryEntityId: 'e2', coveredEntityIds: ['e2'] }]).status, 'PENDING_EVIDENCE');
});

test('wrong counterparty identity fails even when a contract is active', () => {
  assert.equal(check(vendor, [{ ...contract, counterpartyRegistrationNumber: 'WRONG-123' }]).status, 'FAILED');
});

test('draft and pending renewal status never become an automatic pass', () => {
  assert.equal(check(vendor, [{ ...contract, status: 'DRAFT' }]).status, 'REVIEW_REQUIRED');
  assert.equal(check(vendor, [{ ...contract, status: 'RENEWAL_REVIEW' }]).status, 'WARNING');
});

test('expiry, approaching expiry and renewal use live contract dates', () => {
  assert.equal(check(vendor, [{ ...contract, expiryDate: '2026-09-13' }]).status, 'FAILED');
  assert.equal(check(vendor, [{ ...contract, expiryDate: '2026-10-01' }]).status, 'WARNING');
  assert.equal(check(vendor, [{ ...contract, expiryDate: '2027-12-31' }]).status, 'PASSED');
});

test('multiple active agreements require a selected governing agreement', () => {
  const second = { ...contract, id: 'c2' };
  assert.equal(check(vendor, [contract, second]).status, 'REVIEW_REQUIRED');
  assert.equal(check({ ...vendor, agreementContractId: 'c2' }, [contract, second]).sourceRecordId, 'c2');
  assert.equal(check({ ...vendor, agreementContractId: 'not-linked' }, [contract, second]).status, 'FAILED');
});

test('a group agreement can cover a second entity only after that vendor selects it', () => {
  const otherEntityVendor = { ...vendor, id: 'v2', entityId: 'e2' };
  const shared = { ...contract, coveredEntityIds: ['e1', 'e2'] };
  assert.equal(eligibleVendorContracts(otherEntityVendor, [shared]).length, 1);
  assert.equal(check(otherEntityVendor, [shared]).status, 'REVIEW_REQUIRED');
  assert.equal(check({ ...otherEntityVendor, agreementContractId: 'c1' }, [shared]).status, 'PASSED');
});
