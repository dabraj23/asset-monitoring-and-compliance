import type { VendorOwnershipEntry } from '../src/vendorTypes.ts';

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replaceAll(',', '').replace('%', '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/** Ownership is evidence, never inferred from a director's title or paid-up capital alone. */
export const parseOwnershipEntries = (value: unknown): VendorOwnershipEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((raw): VendorOwnershipEntry[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const holderName = String(item.holderName || '').trim();
    const sourceReference = String(item.sourceReference || '').trim();
    if (!holderName || !sourceReference) return [];
    const sharesHeld = finiteNumber(item.sharesHeld);
    const totalShares = finiteNumber(item.totalShares);
    const stated = finiteNumber(item.percentage);
    if (stated !== null && stated > 100) return [];
    const calculated = stated === null && item.ownershipType !== 'BENEFICIAL' && sharesHeld !== null && totalShares !== null && totalShares > 0 && sharesHeld <= totalShares
      ? Math.round(sharesHeld / totalShares * 10000) / 100 : null;
    const percentage = stated ?? calculated;
    return [{
      holderName,
      ownershipType: item.ownershipType === 'BENEFICIAL' ? 'BENEFICIAL' : 'DIRECT',
      shareClass: String(item.shareClass || '').trim(),
      sharesHeld,
      totalShares,
      percentage,
      percentageBasis: stated !== null ? 'STATED' : calculated !== null ? 'CALCULATED' : 'UNKNOWN',
      asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.asOfDate || '')) ? String(item.asOfDate) : '',
      sourceReference,
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
    }];
  });
};
