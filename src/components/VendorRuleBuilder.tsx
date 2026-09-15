import { useState } from 'react';
import { GitBranch, Plus, Save, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useVendors } from '../context/VendorContext';
import { VendorConnector, VendorRuleImpactPreview, VendorRuleScope, VerificationStepType, vendorActivityOptions, vendorDocumentTypes, vendorPersonnelRoles } from '../vendorTypes';

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const workflowSteps: Array<{ value: VerificationStepType; label: string }> = [
  ['DOCUMENT_CLASSIFICATION', 'Document classification'], ['STRUCTURED_EXTRACTION', 'Structured extraction'],
  ['IDENTITY_MATCH', 'Identity and certificate matching'], ['EXPIRY_CHECK', 'Expiry validation'],
  ['REGISTRY_LOOKUP', 'Official registry lookup'], ['CROSS_DOCUMENT_CHECK', 'Cross-document consistency'],
  ['LEGAL_SEARCH', 'Legal / adverse search'], ['MANUAL_FALLBACK', 'Manual fallback'], ['RECOMMENDATION', 'Recommendation and routing'],
].map(([value, label]) => ({ value: value as VerificationStepType, label }));

export function VendorRuleBuilder() {
  const { configuration, addCategory, addRule, updateRule, updateCategory, getRuleImpactPreview, publishRules } = useVendors();
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<VendorRuleImpactPreview | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('ticketing-agency');
  const [form, setForm] = useState({
    name: '', description: '', source: '', scope: 'COMPANY' as VendorRuleScope, parentRuleId: '', categoryId: '', activityTag: '', applicabilityMode: 'ALL' as 'ALL' | 'CATEGORY_OR_ACTIVITY', personnelRole: '',
    documentType: 'OTHER', requiredFields: 'companyName, registrationNumber, expiryDate', connector: 'DOCUMENT_ONLY' as VendorConnector,
    documentPrompt: 'Extract exact identifiers, scope and dates from the document. Cite the page or section for every value.', exceptionPrompt: 'Require human review when required fields, identity, scope or validity cannot be confirmed.', minimumConfidence: 80, matchTolerance: 0,
    blocking: true, active: true, warningDays: 60, slaDays: 7, owner: 'Compliance / Risk',
    steps: workflowSteps.filter(step => step.value !== 'LEGAL_SEARCH').map(step => step.value),
  });
  if (!configuration) return null;

  const createCategory = async () => {
    if (!categoryName.trim()) return;
    setSaving(true);
    try { await addCategory(categoryName, categoryDescription); toast.success('Vendor category added to the draft configuration'); setCategoryName(''); setCategoryDescription(''); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add category'); }
    finally { setSaving(false); }
  };

  const createRule = async () => {
    if (!form.name.trim()) return toast.error('Rule name is required');
    setSaving(true);
    try {
      const candidate = {
        name: form.name, description: form.description, regulatorySource: form.source, scope: form.scope, parentRuleId: form.parentRuleId || undefined,
        categoryIds: form.categoryId ? [form.categoryId] : [], activityTagsAny: form.activityTag ? [form.activityTag] : [],
        applicabilityMode: form.applicabilityMode, personnelRolesAny: form.personnelRole ? [form.personnelRole] : [], documentType: form.documentType,
        requiredFields: form.requiredFields.split(',').map(value => value.trim()).filter(Boolean),
        documentPrompt: form.documentPrompt, exceptionPrompt: form.exceptionPrompt, minimumConfidence: form.minimumConfidence / 100, matchTolerance: form.matchTolerance / 100,
        connector: form.connector, blocking: form.blocking, active: form.active, expiryWarningDays: form.warningDays, followUpSlaDays: form.slaDays,
        escalationOwner: form.owner,
        steps: workflowSteps.map(step => step.value).filter(step => form.steps.includes(step)),
      };
      if (editingRuleId) await updateRule(editingRuleId, candidate); else await addRule(candidate);
      toast.success(editingRuleId ? 'Draft requirement updated' : 'Requirement added to the draft rule pack'); setImpact(null); setShowRuleForm(false); setEditingRuleId(''); setForm(current => ({ ...current, name: '', description: '', source: '' }));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add rule'); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    setSaving(true);
    try { await publishRules(); toast.success('Rule pack published; affected approved vendors were queued for reassessment'); setImpact(null); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to publish rules'); }
    finally { setSaving(false); }
  };

  const previewPublish = async () => {
    setSaving(true);
    try { setImpact(await getRuleImpactPreview()); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to preview the rule impact'); }
    finally { setSaving(false); }
  };
  const editRule = (rule: typeof configuration.draftRules[number]) => {
    setEditingRuleId(rule.id); setShowRuleForm(true);
    const legacyAgreement = rule.id === 'agreement' && rule.connector === 'DOCUMENT_ONLY' && rule.documentType === 'VENDOR_AGREEMENT';
    setForm({ name: rule.name, description: rule.description, source: rule.regulatorySource, scope: rule.scope, parentRuleId: rule.parentRuleId || '', categoryId: rule.categoryIds[0] || '', activityTag: rule.activityTagsAny[0] || '', applicabilityMode: rule.applicabilityMode || 'ALL', personnelRole: rule.personnelRolesAny[0] || '', documentType: legacyAgreement ? 'CONTRACT_REFERENCE' : rule.documentType, requiredFields: legacyAgreement ? '' : rule.requiredFields.join(', '), documentPrompt: rule.documentPrompt || '', exceptionPrompt: rule.exceptionPrompt || '', minimumConfidence: Math.round((rule.minimumConfidence ?? 0.8) * 100), matchTolerance: Math.round((rule.matchTolerance ?? 0) * 100), connector: legacyAgreement ? 'CONTRACT_STATUS' : rule.connector, blocking: rule.blocking, active: rule.active, warningDays: rule.expiryWarningDays, slaDays: rule.followUpSlaDays, owner: rule.escalationOwner, steps: rule.steps });
  };
  const selectedCategory = configuration.categories.find(category => category.id === selectedCategoryId) || configuration.categories[0];
  const visibleParentIds = new Set(configuration.draftRules.filter(rule => !rule.parentRuleId && (!rule.categoryIds.length || rule.categoryIds.includes(selectedCategory?.id || ''))).map(rule => rule.id));
  const visibleRules = configuration.draftRules.filter(rule => rule.parentRuleId ? visibleParentIds.has(rule.parentRuleId) : visibleParentIds.has(rule.id));
  const orderedRules = visibleRules.flatMap(rule => rule.parentRuleId ? [] : [rule, ...visibleRules.filter(child => child.parentRuleId === rule.id)]).concat(visibleRules.filter(rule => rule.parentRuleId && !visibleRules.some(parent => parent.id === rule.parentRuleId)));
  const editCategory = async (category: typeof configuration.categories[number]) => {
    const name = window.prompt('Category name', category.name); if (name === null) return;
    const description = window.prompt('Description', category.description); if (description === null) return;
    try { await updateCategory(category.id, { name, description }); toast.success('Category updated'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update category'); }
  };

  return <div className="space-y-6">
    <div className="rounded-2xl bg-gradient-to-r from-blue-950 to-indigo-900 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-400">Configuration</div><h2 className="mt-2 text-2xl font-bold">Vendor rules and workflows</h2><p className="mt-2 max-w-2xl text-sm text-blue-100">Add categories and evidence rules without changing application code. Rules are versioned when published.</p></div><div className="rounded-xl bg-white/10 px-5 py-4 text-center"><div className="text-xs uppercase text-blue-200">Active rule pack</div><div className="mt-1 text-3xl font-bold">v{configuration.activeVersion}</div></div></div>
    </div>

    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-gray-500">Configure checklist by vendor category</div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{configuration.categories.filter(category => category.active).map(category => <button key={category.id} onClick={() => { setSelectedCategoryId(category.id); setForm(current => ({ ...current, categoryId: category.id })); }} className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-bold ${selectedCategory?.id === category.id ? 'border-blue-800 bg-blue-800 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{category.name}</button>)}</div><div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><strong>{selectedCategory?.name}:</strong> {selectedCategory?.description} · {visibleRules.length} applicable parent and sub-rules in the draft.</div></section>

    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Settings2 className="h-5 w-5" />Vendor categories</div><div className="mt-4 space-y-2">{configuration.categories.map(category => <div key={category.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="flex justify-between gap-2"><div className="text-sm font-bold text-gray-900">{category.name}</div><button onClick={() => void editCategory(category)} className="text-xs font-semibold text-blue-700">Edit</button></div><div className="mt-1 text-xs text-gray-500">{category.description || 'Organisation-defined category'}</div></div>)}</div><div className="mt-4 space-y-2 border-t pt-4"><input className={inputClass} value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="New category name" /><input className={inputClass} value={categoryDescription} onChange={event => setCategoryDescription(event.target.value)} placeholder="Description" /><button onClick={createCategory} disabled={saving || !categoryName.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50"><Plus className="h-4 w-4" />Add category</button></div></section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><GitBranch className="h-5 w-5" />Approval stages</div><div className="mt-4 space-y-3">{configuration.approvalStages.map((stage, index) => <div key={stage.id} className="flex gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">{index + 1}</span><div><div className="text-sm font-bold">{stage.name}</div><div className="text-xs text-gray-500">{stage.requiredRole} · Admin User acts for this demo</div></div></div>)}</div></section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-bold text-blue-950"><ShieldCheck className="h-5 w-5" />{selectedCategory?.name} checklist rules</div><div className="mt-1 text-sm text-gray-500">{visibleRules.length} applicable rules · sub-rules are indented below their parent check</div></div><div className="flex gap-2"><button onClick={() => { setForm(current => ({ ...current, categoryId: selectedCategory?.id || '' })); setShowRuleForm(value => !value); }} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-800"><Plus className="h-4 w-4" />New rule</button><button onClick={previewPublish} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />Preview v{configuration.activeVersion + 1}</button></div></div>

        {impact && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="font-bold text-amber-950">Rule-pack impact preview</div><p className="mt-1 text-sm text-amber-800">{impact.changedRuleIds.length} changed rule(s); {impact.affectedVendors.length} approved vendor(s) will receive reassessment tasks. Existing approvals will not be silently revoked.</p>{!!impact.affectedVendors.length && <div className="mt-2 text-xs text-amber-800">{impact.affectedVendors.map(vendor => vendor.legalName).join(', ')}</div>}<div className="mt-3 flex justify-end gap-2"><button onClick={() => setImpact(null)} className="px-3 py-2 text-xs font-bold text-gray-600">Keep editing</button><button onClick={publish} disabled={saving || !impact.changedRuleIds.length} className="rounded-lg bg-blue-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Publish version {impact.nextVersion}</button></div></div>}

        {showRuleForm && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputClass} value={form.name} onChange={event => setForm({...form, name: event.target.value})} placeholder="Requirement name *" />
            <input className={inputClass} value={form.source} onChange={event => setForm({...form, source: event.target.value})} placeholder="Regulatory source" />
            <input className={`${inputClass} sm:col-span-2`} value={form.description} onChange={event => setForm({...form, description: event.target.value})} placeholder="What must be verified?" />
            <select className={inputClass} value={form.scope} onChange={event => setForm({...form, scope: event.target.value as VendorRuleScope, requiredFields: event.target.value === 'PERSON' ? 'personName, certificateNumber, expiryDate' : 'companyName, registrationNumber, expiryDate'})}><option value="COMPANY">Company-level</option><option value="PERSON">Person-level</option></select>
            <select className={inputClass} value={form.categoryId} onChange={event => setForm({...form, categoryId: event.target.value})}><option value="">Any category</option>{configuration.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <select className={inputClass} value={form.parentRuleId} onChange={event => setForm({...form, parentRuleId: event.target.value})}><option value="">Parent checklist rule</option>{configuration.draftRules.filter(rule => rule.id !== editingRuleId && !rule.parentRuleId).map(rule => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select>
            <select className={inputClass} value={form.activityTag} onChange={event => setForm({...form, activityTag: event.target.value})}><option value="">Any activity</option>{vendorActivityOptions.map(activity => <option key={activity.value} value={activity.value}>{activity.label}</option>)}</select>
            <select className={inputClass} value={form.applicabilityMode} onChange={event => setForm({...form, applicabilityMode: event.target.value as 'ALL' | 'CATEGORY_OR_ACTIVITY'})}><option value="ALL">Category AND activity (when both set)</option><option value="CATEGORY_OR_ACTIVITY">Category OR activity</option></select>
            <select className={inputClass} value={form.personnelRole} onChange={event => setForm({...form, personnelRole: event.target.value})} disabled={form.scope !== 'PERSON'}><option value="">Every person</option>{vendorPersonnelRoles.map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}</select>
            <div><input className={inputClass} list="vendor-document-codes" value={form.documentType} onChange={event => setForm({...form, documentType: event.target.value.toUpperCase().replaceAll(' ', '_')})} aria-label="Document type code" /><datalist id="vendor-document-codes">{vendorDocumentTypes.map(type => <option key={type} value={type} />)}</datalist></div>
            <select className={inputClass} value={form.connector} onChange={event => setForm({...form, connector: event.target.value as VendorConnector, ...(event.target.value === 'CONTRACT_STATUS' ? { documentType: 'CONTRACT_REFERENCE', requiredFields: '', scope: 'COMPANY' as const } : {})})}><option value="DOCUMENT_ONLY">Document only</option><option value="CONTRACT_STATUS">Linked Contract Management record</option><option value="CIDB_CONTRACTOR">CIDB contractor</option><option value="CIDB_PERSONNEL">CIDB personnel</option><option value="DOSH_PERSONNEL">DOSH personnel</option><option value="DOSH_COMPANY">DOSH company</option><option value="MOTAC_TOBTAB">MOTAC TOBTAB</option><option value="LEGAL_SEARCH">Legal web search</option><option value="CTOS">CTOS evidence</option><option value="BANK_VERIFICATION">Bank evidence</option></select>
            <label className="text-xs text-gray-600 sm:col-span-2">Required extracted fields, comma separated<input className={`${inputClass} mt-1`} value={form.requiredFields} onChange={event => setForm({...form, requiredFields: event.target.value})} /></label>
            <label className="text-xs text-gray-600 sm:col-span-2">AI document-reading prompt<textarea rows={3} className={`${inputClass} mt-1`} value={form.documentPrompt} onChange={event => setForm({...form, documentPrompt: event.target.value})} /></label>
            <label className="text-xs text-gray-600 sm:col-span-2">Exception and reviewer prompt<textarea rows={2} className={`${inputClass} mt-1`} value={form.exceptionPrompt} onChange={event => setForm({...form, exceptionPrompt: event.target.value})} /></label>
            <label className="text-xs text-gray-600">Minimum AI confidence (%)<input type="number" min="0" max="100" className={`${inputClass} mt-1`} value={form.minimumConfidence} onChange={event => setForm({...form, minimumConfidence: Number(event.target.value)})} /></label>
            <label className="text-xs text-gray-600">Permitted matching tolerance (%)<input type="number" min="0" max="100" className={`${inputClass} mt-1`} value={form.matchTolerance} onChange={event => setForm({...form, matchTolerance: Number(event.target.value)})} /></label>
            <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><input type="checkbox" checked={form.blocking} onChange={event => setForm({...form, blocking: event.target.checked})} />Blocking requirement</label>
            <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><input type="checkbox" checked={form.active} onChange={event => setForm({...form, active: event.target.checked})} />Include in the published onboarding checklist</label>
            <input className={inputClass} value={form.owner} onChange={event => setForm({...form, owner: event.target.value})} placeholder="Escalation owner" />
            <label className="text-xs text-gray-600">Expiry warning days<input type="number" className={`${inputClass} mt-1`} value={form.warningDays} onChange={event => setForm({...form, warningDays: Number(event.target.value)})} /></label>
            <label className="text-xs text-gray-600">Follow-up SLA days<input type="number" className={`${inputClass} mt-1`} value={form.slaDays} onChange={event => setForm({...form, slaDays: Number(event.target.value)})} /></label>
          </div>
          <div className="mt-4"><div className="text-xs font-bold uppercase tracking-wider text-gray-500">Ordered verification steps</div><div className="mt-2 grid gap-2 sm:grid-cols-2">{workflowSteps.map((step, index) => <label key={step.value} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs"><input type="checkbox" checked={form.steps.includes(step.value)} onChange={() => setForm(current => ({ ...current, steps: current.steps.includes(step.value) ? current.steps.filter(value => value !== step.value) : [...current.steps, step.value] }))} /><span className="font-bold text-blue-700">{index + 1}</span>{step.label}</label>)}</div></div>
          <div className="mt-4 rounded-lg bg-white p-3 text-xs leading-5 text-gray-600"><strong>Outcome policy:</strong> missing evidence stays pending and appears in the vendor request checklist; present and matching evidence passes; expired or mismatched evidence fails; low-confidence or restricted-source checks require review.</div>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => { setShowRuleForm(false); setEditingRuleId(''); }} className="px-4 py-2 text-sm font-bold text-gray-600">Cancel</button><button onClick={createRule} disabled={saving || !form.steps.length} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{editingRuleId ? 'Save draft changes' : 'Add to draft'}</button></div>
        </div>}

        <div className="mt-5 max-h-[720px] space-y-3 overflow-y-auto pr-1">{orderedRules.map(rule => <div key={rule.id} className={`rounded-xl border p-4 ${rule.parentRuleId ? 'ml-6 border-indigo-100 bg-indigo-50/30' : 'border-gray-100'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div>{rule.parentRuleId && <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">Sub-rule of {configuration.draftRules.find(parent => parent.id === rule.parentRuleId)?.name || 'checklist rule'}</div>}<div className="font-bold text-gray-900">{rule.name}</div><div className="mt-1 text-sm text-gray-500">{rule.description}</div></div><div className="flex items-center gap-2"><button onClick={() => editRule(rule)} className="text-xs font-semibold text-blue-700">Edit</button><div className={`rounded-full px-2.5 py-1 text-xs font-bold ${rule.blocking ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{rule.blocking ? 'Blocking' : 'Warning'}</div></div></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded bg-gray-100 px-2 py-1">{rule.id === 'agreement' && rule.connector === 'DOCUMENT_ONLY' && rule.documentType === 'VENDOR_AGREEMENT' ? 'Contract Management reference (legacy)' : rule.documentType.replace(/_/g, ' ')}</span><span className="rounded bg-blue-50 px-2 py-1 text-blue-700">{rule.id === 'agreement' && rule.connector === 'DOCUMENT_ONLY' && rule.documentType === 'VENDOR_AGREEMENT' ? 'Contract status' : rule.connector.replace(/_/g, ' ')}</span><span className="rounded bg-gray-100 px-2 py-1">{rule.steps.length} steps</span><span className="rounded bg-purple-50 px-2 py-1 text-purple-700">Confidence ≥ {Math.round((rule.minimumConfidence ?? 0.8) * 100)}%</span></div><details className="mt-3 text-xs text-gray-600"><summary className="cursor-pointer font-bold text-blue-700">AI reading and exception prompts</summary><div className="mt-2 rounded-lg bg-gray-50 p-3"><strong>Read:</strong> {rule.documentPrompt || 'Default extraction prompt'}<br /><strong>Exception:</strong> {rule.exceptionPrompt || 'Default human-review prompt'}</div></details></div>)}{!orderedRules.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">No checklist rules apply to this category yet. Add a rule to define its evidence and checks.</div>}</div>
      </section>
    </div>
  </div>;
}
