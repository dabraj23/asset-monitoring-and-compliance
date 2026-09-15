import { contractStore } from './contractStore.ts';
import { mergeLshStructure } from './lshStructure.ts';

await contractStore.init();
const merged = mergeLshStructure(await contractStore.entities());
for (const entity of merged.entities) await contractStore.saveEntity(entity);
console.log(`LSH corporate structure ready: ${Object.keys(merged.lshEntityIds).length} legal entities.`);
