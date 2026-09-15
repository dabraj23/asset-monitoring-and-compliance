import { createSeedConfiguration } from './vendorEngine.ts';
import { vendorStore } from './vendorStore.ts';

await vendorStore.init();
const configuration = await vendorStore.configuration();
const recommended = createSeedConfiguration();
const published = configuration.publishedVersions.find(version => version.version === configuration.activeVersion);
const alreadyCurrent = published?.rules.some(rule => rule.id === 'cidb-company'
  && rule.applicabilityMode === 'CATEGORY_OR_ACTIVITY'
  && rule.categoryIds.includes('scaffolding-contractor'))
  && published.rules.some(rule => rule.id === 'osha-hirarc' && rule.parentRuleId === 'osha-policy')
  && published.rules.some(rule => rule.id === 'osha-policy'
    && rule.applicabilityMode === 'CATEGORY_OR_ACTIVITY'
    && rule.categoryIds.includes('main-contractor'));

if (alreadyCurrent) {
  console.log(`Vendor rule pack v${configuration.activeVersion} already contains the category and risk defaults.`);
} else {
  const existingDraft = new Map(configuration.draftRules.map(rule => [rule.id, rule]));
  const recommendedIds = new Set(recommended.draftRules.map(rule => rule.id));
  const mergedRules = [
    ...recommended.draftRules.map(rule => ({ ...existingDraft.get(rule.id), ...rule })),
    ...configuration.draftRules.filter(rule => !recommendedIds.has(rule.id)),
  ];
  const existingCategories = new Map(configuration.categories.map(category => [category.id, category]));
  configuration.categories = [
    ...recommended.categories.map(category => existingCategories.get(category.id) || category),
    ...configuration.categories.filter(category => !recommended.categories.some(seed => seed.id === category.id)),
  ];
  configuration.draftRules = structuredClone(mergedRules);
  configuration.activeVersion += 1;
  configuration.publishedVersions.push({
    version: configuration.activeVersion,
    publishedAt: new Date().toISOString(),
    rules: structuredClone(mergedRules),
  });
  await vendorStore.saveConfiguration(configuration);
  console.log(`Published vendor rule pack v${configuration.activeVersion}: ${mergedRules.length} category-aware parent and sub-rules.`);
}
