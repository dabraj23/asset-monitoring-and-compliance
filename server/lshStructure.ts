import type { CorporateEntity, CorporateOwnershipInterest, CorporateEntityType } from '../src/contractTypes.ts';

type LshSpec = {
  key: string;
  legalName: string;
  entityType: CorporateEntityType;
  operationalParent?: string;
  owners?: Array<{ key: string; percentage?: number; relationship?: CorporateOwnershipInterest['relationship'] }>;
};

export const lshStructureSpecs: LshSpec[] = [
  { key: 'capital', legalName: 'Lim Seong Hai Capital Berhad', entityType: 'HOLDING_COMPANY' },
  { key: 'lighting', legalName: 'Lim Seong Hai Lighting Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
  { key: 'knight-auto', legalName: 'Knight Auto Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
  { key: 'best-builders', legalName: 'LSH BEST Builders Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
  { key: 'service-master', legalName: 'LSH Service Master Sdn Bhd', entityType: 'SUBSIDIARY', operationalParent: 'best-builders', owners: [{ key: 'best-builders', percentage: 70 }] },
  { key: 'astana-setia', legalName: 'Astana Setia Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
  { key: 'ventures', legalName: 'Lim Seong Hai Ventures Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
  { key: 'astana-euro', legalName: 'Astana Setia & Euro Saga Sdn Bhd', entityType: 'JOINT_VENTURE', operationalParent: 'ventures', owners: [{ key: 'astana-setia', percentage: 6.25, relationship: 'JOINT_VENTURE' }, { key: 'ventures', percentage: 87.5, relationship: 'JOINT_VENTURE' }] },
  { key: 'infra', legalName: 'LSH Infra Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
  { key: 'pertama-markmur', legalName: 'LSH Pertama Markmur Sdn Bhd', entityType: 'SUBSIDIARY', operationalParent: 'infra', owners: [{ key: 'infra', percentage: 50 }] },
  { key: 'development', legalName: 'Lim Seong Hai Development Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
  { key: 'astana-development', legalName: 'Astana Setia Development Sdn. Bhd.', entityType: 'SUBSIDIARY', operationalParent: 'capital' },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliasesFor = (name: string) => [...new Set([name.replace(/\bSdn\.?\s*Bhd\.?$/i, '').trim(), name.replaceAll('.', '')])].filter(alias => normalize(alias) !== normalize(name));

export const mergeLshStructure = (existing: CorporateEntity[], timestamp = new Date().toISOString()) => {
  const result = structuredClone(existing).map(entity => ({ ...entity, ownershipInterests: entity.ownershipInterests || [] }));
  const ids = new Map<string, string>();
  for (const spec of lshStructureSpecs) {
    const prior = result.find(entity => normalize(entity.legalName) === normalize(spec.legalName)
      || (spec.key === 'best-builders' && ['lshbestbuilderssdnbhd', 'lshbuilderssdnbhd'].includes(normalize(entity.legalName))));
    const id = prior?.id || `entity-lsh-${spec.key}`;
    ids.set(spec.key, id);
    if (!prior) result.push({
      id, legalName: spec.legalName, displayName: spec.legalName.replace(/\s+Sdn\.?\s+Bhd\.?$/i, ''), entityType: spec.entityType,
      registrationNumber: '', jurisdiction: 'Malaysia', registeredAddress: '', aliases: aliasesFor(spec.legalName), principalActivities: [], businessUnits: [], sites: [],
      effectiveFrom: timestamp.slice(0, 10), active: true, ownershipInterests: [], roleAssignments: [], createdAt: timestamp, updatedAt: timestamp,
    });
  }
  for (const spec of lshStructureSpecs) {
    const entity = result.find(item => item.id === ids.get(spec.key))!;
    entity.legalName = spec.legalName;
    entity.displayName ||= spec.legalName.replace(/\s+Sdn\.?\s+Bhd\.?$/i, '');
    entity.entityType = spec.entityType;
    entity.parentId = spec.operationalParent ? ids.get(spec.operationalParent) : undefined;
    const owners = spec.owners || (spec.operationalParent ? [{ key: spec.operationalParent }] : []);
    entity.ownershipInterests = owners.map(owner => ({ ownerEntityId: ids.get(owner.key)!, percentage: owner.percentage, relationship: owner.relationship || 'DIRECT' }));
    entity.aliases = [...new Set([...(entity.aliases || []), ...aliasesFor(spec.legalName)])];
    entity.updatedAt = timestamp;
  }
  return { entities: result, lshEntityIds: Object.fromEntries(ids) };
};
