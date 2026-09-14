import type { VendorRule } from './vendorTypes';

export interface VendorChecklistContext {
  categoryId: string;
  activityTags: string[];
  personnelRoles: string[];
}

export const ruleAppliesToContext = (rule: VendorRule, context: VendorChecklistContext) =>
  rule.active
  && (!rule.categoryIds.length || rule.categoryIds.includes(context.categoryId))
  && (!rule.activityTagsAny.length || rule.activityTagsAny.some(tag => context.activityTags.includes(tag)))
  && (rule.scope !== 'PERSON' || !rule.personnelRolesAny.length || rule.personnelRolesAny.some(role => context.personnelRoles.includes(role)));

export const checklistFor = (rules: VendorRule[], context: VendorChecklistContext) =>
  rules.filter(rule => ruleAppliesToContext(rule, context));
