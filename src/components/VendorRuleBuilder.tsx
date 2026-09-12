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
  const { configuration, addCategory, addRule, getRuleImpactPreview, publishRules } = useVendors();
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<VendorRuleImpactPreview | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', source: '', scope: 'COMPANY' as VendorRuleScope, categoryId: '', activityTag: '', personnelRole: '',
    documentType: 'OTHER', requiredFields: 'companyName, registrationNumber, expiryDate', connector: 'DOCUMENT_ONLY' as VendorConnector,
    blocking: true, warningDays: 60, slaDays: 7, owner: 'Compliance / Risk',
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
      await addRule({
        name: form.name, description: form.description, regulatorySource: form.source, scope: form.scope,
        categoryIds: form.categoryId ? [form.categoryId] : [], activityTagsAny: form.activityTag ? [form.activityTag] : [],
        personnelRolesAny: form.personnelRole ? [form.personnelRole] : [], documentType: form.documentType,
        requiredFields: form.requiredFields.split(',').map(value => value.trim()).filter(Boolean),
        connector: form.connector, blocking: form.blocking, expiryWarningDays: form.warningDays, followUpSlaDays: form.slaDays,
        escalationOwner: form.owner,
        steps: workflowSteps.map(step => step.value).filter(step => form.steps.includes(step)),
      });
      toast.success('Requirement added to the draft rule pack'); setImpact(null); setShowRuleForm(false); setForm(current => ({ ...current, name: '', description: '', source: '' }));
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

  return <div className="space-y-6">
    <div className="rounded-2xl bg-gradient-to-r from-blue-950 to-indigo-900 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-400">Configuration</div><h2 className="mt-2 text-2xl font-bold">Vendor rules and workflows</h2><p className="mt-2 max-w-2xl text-sm text-blue-100">Add categories and evidence rules without changing application code. Rules are versioned when published.</p></div><div className="rounded-xl bg-white/10 px-5 py-4 text-center"><div className="text-xs uppercase text-blue-200">Active rule pack</div><div className="mt-1 text-3xl font-bold">v{configuration.activeVersion}</div></div></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><Settings2 className="h-5 w-5" />Vendor categories</div><div className="mt-4 space-y-2">{configuration.categories.map(category => <div key={category.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="text-sm font-bold text-gray-900">{category.name}</div><div className="mt-1 text-xs text-gray-500">{category.description || 'Organisation-defined category'}</div></div>)}</div><div className="mt-4 space-y-2 border-t pt-4"><input className={inputClass} value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="New category name" /><input className={inputClass} value={categoryDescription} onChange={event => setCategoryDescription(event.target.value)} placeholder="Description" /><button onClick={createCategory} disabled={saving || !categoryName.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50"><Plus className="h-4 w-4" />Add category</button></div></section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-blue-950"><GitBranch className="h-5 w-5" />Approval stages</div><div className="mt-4 space-y-3">{configuration.approvalStages.map((stage, index) => <div key={stage.id} className="flex gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">{index + 1}</span><div><div className="text-sm font-bold">{stage.name}</div><div className="text-xs text-gray-500">{stage.requiredRole} · Admin User acts for this demo</div></div></div>)}</div></section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-bold text-blue-950"><ShieldCheck className="h-5 w-5" />Draft requirements</div><div className="mt-1 text-sm text-gray-500">{configuration.draftRules.length} rules configured</div></div><div className="flex gap-2"><button onClick={() => setShowRuleForm(value => !value)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-800"><Plus className="h-4 w-4" />New rule</button><button onClick={previewPublish} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />Preview v{configuration.activeVersion + 1}</button></div></div>

        {impact && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="font-bold text-amber-950">Rule-pack impact preview</div><p className="mt-1 text-sm text-amber-800">{impact.changedRuleIds.length} changed rule(s); {impact.affectedVendors.length} approved vendor(s) will receive reassessment tasks. Existing approvals will not be silently revoked.</p>{!!impact.affectedVendors.length && <div className="mt-2 text-xs text-amber-800">{impact.affectedVendors.map(vendor => vendor.legalName).join(', ')}</div>}<div className="mt-3 flex justify-end gap-2"><button onClick={() => setImpact(null)} className="px-3 py-2 text-xs font-bold text-gray-600">Keep editing</button><button onClick={publish} disabled={saving || !impact.changedRuleIds.length} className="rounded-lg bg-blue-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Publish version {impact.nextVersion}</button></div></div>}

        {showRuleForm && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputClass} value={form.name} onChange={event => setForm({...form, name: event.target.value})} placeholder="Requirement name *" />
            <input className={inputClass} value={form.source} onChange={event => setForm({...form, source: event.target.value})} placeholder="Regulatory source" />
            <input className={`${inputClass} sm:col-span-2`} value={form.description} onChange={event => setForm({...form, description: event.target.value})} placeholder="What must be verified?" />
            <select className={inputClass} value={form.scope} onChange={event => setForm({...form, scope: event.target.value as VendorRuleScope, requiredFields: event.target.value === 'PERSON' ? 'personName, certificateNumber, expiryDate' : 'companyName, registrationNumber, expiryDate'})}><option value="COMPANY">Company-level</option><option value="PERSON">Person-level</option></select>
            <select className={inputClass} value={form.categoryId} onChange={event => setForm({...form, categoryId: event.target.value})}><option value="">Any category</option>{configuration.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <select className={inputClass} value={form.activityTag} onChange={event => setForm({...form, activityTag: event.target.value})}><option value="">Any activity</option>{vendorActivityOptions.map(activity => <option key={activity.value} value={activity.value}>{activity.label}</option>)}</select>
            <select className={inputClass} value={form.personnelRole} onChange={event => setForm({...form, personnelRole: event.target.value})} disabled={form.scope !== 'PERSON'}><option value="">Every person</option>{vendorPersonnelRoles.map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}</select>
            <select className={inputClass} value={form.documentType} onChange={event => setForm({...form, documentType: event.target.value})}>{vendorDocumentTypes.map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</select>
            <select className={inputClass} value={form.connector} onChange={event => setForm({...form, connector: event.target.value as VendorConnector})}><option value="DOCUMENT_ONLY">Document only</option><option value="CIDB_CONTRACTOR">CIDB contractor</option><option value="CIDB_PERSONNEL">CIDB personnel</option><option value="DOSH_PERSONNEL">DOSH personnel</option><option value="DOSH_COMPANY">DOSH company</option><option value="MOTAC_TOBTAB">MOTAC TOBTAB</option><option value="LEGAL_SEARCH">Legal web search</option><option value="CTOS">CTOS evidence</option><option value="BANK_VERIFICATION">Bank evidence</option></select>
            <label className="text-xs text-gray-600 sm:col-span-2">Required extracted fields, comma separated<input className={`${inputClass} mt-1`} value={form.requiredFields} onChange={event => setForm({...form, requiredFields: event.target.value})} /></label>
            <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><input type="checkbox" checked={form.blocking} onChange={event => setForm({...form, blocking: event.target.checked})} />Blocking requirement</label>
            <input className={inputClass} value={form.owner} onChange={event => setForm({...form, owner: event.target.value})} placeholder="Escalation owner" />
            <label className="text-xs text-gray-600">Expiry warning days<input type="number" className={`${inputClass} mt-1`} value={form.warningDays} onChange={event => setForm({...form, warningDays: Number(event.target.value)})} /></label>
            <label className="text-xs text-gray-600">Follow-up SLA days<input type="number" className={`${inputClass} mt-1`} value={form.slaDays} onChange={event => setForm({...form, slaDays: Number(event.target.value)})} /></label>
          </div>
          <div className="mt-4"><div className="text-xs font-bold uppercase tracking-wider text-gray-500">Ordered verification steps</div><div className="mt-2 grid gap-2 sm:grid-cols-2">{workflowSteps.map((step, index) => <label key={step.value} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs"><input type="checkbox" checked={form.steps.includes(step.value)} onChange={() => setForm(current => ({ ...current, steps: current.steps.includes(step.value) ? current.steps.filter(value => value !== step.value) : [...current.steps, step.value] }))} /><span className="font-bold text-blue-700">{index + 1}</span>{step.label}</label>)}</div></div>
          <div className="mt-4 rounded-lg bg-white p-3 text-xs leading-5 text-gray-600"><strong>Outcome policy:</strong> present and matching evidence passes; approaching expiry warns; missing/expired/mismatched blocking evidence fails; low-confidence or restricted-source checks require review; provider outages are unavailable.</div>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setShowRuleForm(false)} className="px-4 py-2 text-sm font-bold text-gray-600">Cancel</button><button onClick={createRule} disabled={saving || !form.steps.length} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Add to draft</button></div>
        </div>}

        <div className="mt-5 max-h-[720px] space-y-3 overflow-y-auto pr-1">{configuration.draftRules.map(rule => <div key={rule.id} className="rounded-xl border border-gray-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold text-gray-900">{rule.name}</div><div className="mt-1 text-sm text-gray-500">{rule.description}</div></div><div className={`rounded-full px-2.5 py-1 text-xs font-bold ${rule.blocking ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{rule.blocking ? 'Blocking' : 'Warning'}</div></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded bg-gray-100 px-2 py-1">{rule.scope}</span><span className="rounded bg-gray-100 px-2 py-1">{rule.documentType.replace(/_/g, ' ')}</span><span className="rounded bg-blue-50 px-2 py-1 text-blue-700">{rule.connector.replace(/_/g, ' ')}</span><span className="rounded bg-gray-100 px-2 py-1">{rule.steps.length} workflow steps</span></div></div>)}</div>
      </section>
    </div>
  </div>;
}
