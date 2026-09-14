import type { Contract } from '../src/contractTypes.ts';
import type { RequirementResult, Vendor, VendorRule } from '../src/vendorTypes.ts';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const active = (contract: Contract) => ['ACTIVE', 'RENEWAL_REVIEW'].includes(contract.status);

export const isAgreementRule = (rule: VendorRule) => rule.connector === 'CONTRACT_STATUS'
  || (rule.id === 'agreement' && rule.connector === 'DOCUMENT_ONLY' && rule.documentType === 'VENDOR_AGREEMENT');

export const eligibleVendorContracts = (vendor: Vendor, contracts: Contract[]) => contracts.filter(contract =>
  !!vendor.entityId && (contract.primaryEntityId === vendor.entityId || contract.coveredEntityIds.includes(vendor.entityId))
  && (contract.vendorId === vendor.id || (!!contract.counterpartyRegistrationNumber && normalize(contract.counterpartyRegistrationNumber) === normalize(vendor.registrationNumber))),
);

export const evaluateVendorAgreement = (
  vendor: Vendor,
  contracts: Contract[],
  rule: VendorRule,
  asOf = new Date().toISOString().slice(0, 10),
): RequirementResult => {
  const candidates = eligibleVendorContracts(vendor, contracts);
  const directlyLinked = candidates.filter(contract => contract.vendorId === vendor.id);
  const selected = vendor.agreementContractId
    ? candidates.find(contract => contract.id === vendor.agreementContractId)
    : directlyLinked.filter(active).length === 1
      ? directlyLinked.find(active)
      : directlyLinked.length === 1 ? directlyLinked[0] : undefined;
  const base: RequirementResult = {
    id: `${rule.id}:company`, ruleId: rule.id, ruleName: rule.name, scope: 'COMPANY',
    subjectName: vendor.legalName, blocking: rule.blocking, status: 'REVIEW_REQUIRED',
    reason: '', evidenceIds: [], verificationIds: [], sourceRecordId: selected?.id,
  };
  if (vendor.agreementContractId && !selected) return { ...base, status: 'FAILED', reason: 'The selected agreement is no longer linked to this vendor and entity.' };
  if (!candidates.length) return { ...base, status: 'PENDING_EVIDENCE', reason: 'Link or create a governing agreement for this vendor and entity in Contract Management.' };
  if (!selected) return { ...base, reason: 'Select the governing agreement for this entity. Shared group agreements require explicit confirmation.' };
  const identity = normalize(selected.counterpartyRegistrationNumber || '');
  if (!identity) return { ...base, reason: 'Confirm the counterparty registration number on the linked contract.' };
  if (identity !== normalize(vendor.registrationNumber)) return { ...base, status: 'FAILED', reason: 'The contract counterparty registration number does not match this vendor.' };
  if (!active(selected)) return { ...base, status: ['EXPIRED', 'CLOSED', 'ARCHIVED'].includes(selected.status) ? 'FAILED' : 'REVIEW_REQUIRED', reason: `The linked contract is ${selected.status.toLowerCase().replaceAll('_', ' ')}; activate and review it in Contract Management.` };
  if (!selected.effectiveDate || !selected.expiryDate) return { ...base, reason: 'Confirm the effective and expiry dates in Contract Management.' };
  if (selected.effectiveDate > asOf) return { ...base, reason: `The agreement only takes effect on ${selected.effectiveDate}.`, expiresAt: selected.expiryDate };
  if (selected.expiryDate < asOf) return { ...base, status: 'FAILED', reason: `The linked agreement expired on ${selected.expiryDate}.`, expiresAt: selected.expiryDate };
  const days = Math.round((Date.parse(`${selected.expiryDate}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000);
  if (days <= rule.expiryWarningDays || selected.status === 'RENEWAL_REVIEW') return {
    ...base, status: 'WARNING', reason: selected.status === 'RENEWAL_REVIEW' ? 'A renewal is under review in Contract Management.' : `The linked agreement expires in ${days} days.`, expiresAt: selected.expiryDate,
  };
  return { ...base, status: 'PASSED', reason: 'Linked Contract Management agreement is active, identity-matched and within its validity period.', expiresAt: selected.expiryDate };
};
