import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedEntities } from './contractEngine.ts';
import { lshStructureSpecs, mergeLshStructure } from './lshStructure.ts';

test('LSH structure is idempotent and models the shared joint venture once', () => {
  const first = mergeLshStructure(createSeedEntities(), '2026-09-15T00:00:00.000Z');
  const second = mergeLshStructure(first.entities, '2026-09-15T00:00:00.000Z');
  assert.equal(second.entities.length, first.entities.length);
  assert.equal(lshStructureSpecs.length, 12);
  const jointVenture = first.entities.find(entity => entity.legalName === 'Astana Setia & Euro Saga Sdn Bhd')!;
  assert.equal(first.entities.filter(entity => entity.legalName === jointVenture.legalName).length, 1);
  assert.deepEqual(jointVenture.ownershipInterests.map(interest => interest.percentage).sort(), [6.25, 87.5]);
  assert.equal(jointVenture.parentId, first.lshEntityIds.ventures);
});

test('LSH percentages from the supplied structure are retained without inventing unknown holdings', () => {
  const { entities } = mergeLshStructure([]);
  const serviceMaster = entities.find(entity => entity.legalName === 'LSH Service Master Sdn Bhd')!;
  const lighting = entities.find(entity => entity.legalName === 'Lim Seong Hai Lighting Sdn. Bhd.')!;
  assert.equal(serviceMaster.ownershipInterests[0].percentage, 70);
  assert.equal(lighting.ownershipInterests[0].percentage, undefined);
  assert.equal(lighting.registrationNumber, '');
});
