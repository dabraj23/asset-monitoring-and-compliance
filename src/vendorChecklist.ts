import type { VendorRule } from './vendorTypes';

export interface VendorChecklistContext {
  categoryId: string;
  activityTags: string[];
  personnelRoles: string[];
}

export interface VendorChecklistPerson {
  role: string;
  complianceRoles?: string[];
  cidbCheckRequired?: boolean;
  doshCheckRequired?: boolean;
}

export const personnelRoleCodes = (person: VendorChecklistPerson) => [...new Set([person.role, ...(person.complianceRoles || [])].filter(Boolean))];

export const ruleAppliesToPerson = (rule: VendorRule, person: VendorChecklistPerson) => {
  if (rule.connector === 'CIDB_PERSONNEL' && person.cidbCheckRequired === false) return false;
  if (rule.connector === 'DOSH_PERSONNEL' && person.doshCheckRequired === false) return false;
  const roles = personnelRoleCodes(person);
  return !rule.personnelRolesAny.length || rule.personnelRolesAny.some(role => roles.includes(role));
};

export const ruleAppliesToContext = (rule: VendorRule, context: VendorChecklistContext) => {
  const category = !rule.categoryIds.length || rule.categoryIds.includes(context.categoryId);
  const activity = !rule.activityTagsAny.length || rule.activityTagsAny.some(tag => context.activityTags.includes(tag));
  const mainApplicability = rule.applicabilityMode === 'CATEGORY_OR_ACTIVITY' && rule.categoryIds.length && rule.activityTagsAny.length
    ? category || activity
    : category && activity;
  return rule.active && mainApplicability
    && (rule.scope !== 'PERSON' || !rule.personnelRolesAny.length || rule.personnelRolesAny.some(role => context.personnelRoles.includes(role)));
};

export const checklistFor = (rules: VendorRule[], context: VendorChecklistContext) =>
  rules.filter(rule => ruleAppliesToContext(rule, context));
