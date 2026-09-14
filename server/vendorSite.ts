import type { Vendor, VendorSiteMobilisation } from '../src/vendorTypes.ts';

export interface SiteReadiness { status: 'READY_FOR_APPROVAL' | 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCKED'; reasons: string[] }

export const assessSiteReadiness = (vendor: Vendor, site: VendorSiteMobilisation, onDate = new Date().toISOString().slice(0, 10)): SiteReadiness => {
  const reasons: string[] = [];
  if (vendor.onboardingStatus !== 'APPROVED') reasons.push('Vendor company approval is not active.');
  if (vendor.riskCases?.some(item => item.status === 'OPEN' && ['HIGH', 'CRITICAL'].includes(item.severity))) reasons.push('An open high-severity vendor risk case requires review before mobilisation.');
  if (vendor.requirementResults.some(result => result.scope === 'COMPANY' && result.blocking && (result.status !== 'PASSED' && result.status !== 'WARNING' || !!result.expiresAt && result.expiresAt < onDate))) reasons.push('A mandatory company requirement is failed, expired or awaiting review.');
  if (!site.personnelIds.length) reasons.push('Add at least one named worker to the site roster.');
  const assigned = vendor.personnel.filter(person => person.status === 'ACTIVE' && person.siteAssignment.trim().toLowerCase() === site.siteName.trim().toLowerCase()).map(person => person.id).sort();
  if (assigned.length && JSON.stringify(assigned) !== JSON.stringify([...site.personnelIds].sort())) reasons.push('The current site assignment differs from this approved roster. Review the roster again.');
  for (const id of site.personnelIds) {
    const person = vendor.personnel.find(item => item.id === id);
    if (!person || person.status !== 'ACTIVE') { reasons.push(`Worker ${id} is inactive or missing.`); continue; }
    if (person.siteAssignment && person.siteAssignment.trim().toLowerCase() !== site.siteName.trim().toLowerCase()) reasons.push(`${person.name} is assigned to a different site.`);
    const checks = vendor.requirementResults.filter(result => result.subjectId === id && result.blocking);
    if (!checks.length) reasons.push(`${person.name} has no completed personnel competency checks.`);
    else if (checks.some(result => result.status !== 'PASSED' && result.status !== 'WARNING' || !!result.expiresAt && result.expiresAt < onDate)) reasons.push(`${person.name} has a mandatory failed, expired or pending competency check.`);
    const induction = vendor.documents.find(document => document.id === site.inductionDocumentIds[id]);
    if (!induction || induction.subjectId !== id || induction.documentType !== 'SITE_INDUCTION' || induction.extractionStatus !== 'COMPLETED') reasons.push(`${person.name} needs a reviewed site-induction document.`);
  }
  if (reasons.length) return { status: 'BLOCKED', reasons };
  if (site.decision === 'REJECTED') return { status: 'REVIEW_REQUIRED', reasons: [site.decisionNotes || 'Site mobilisation was rejected.'] };
  if (site.decision === 'APPROVED' && JSON.stringify([...(site.approvedRosterIds || [])].sort()) === JSON.stringify([...site.personnelIds].sort())) return { status: 'APPROVED', reasons: [] };
  return { status: 'READY_FOR_APPROVAL', reasons: [] };
};
