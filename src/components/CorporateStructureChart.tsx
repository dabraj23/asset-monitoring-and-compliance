import { useState, type ReactNode } from 'react';
import { Building2, ChevronDown, ChevronRight, GitBranch } from 'lucide-react';
import type { CorporateEntity } from '../contractTypes';

export function CorporateStructureChart({ entities }: { entities: CorporateEntity[] }) {
  const [selectedId, setSelectedId] = useState(entities[0]?.id || '');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const known = new Set(entities.map(entity => entity.id));
  const roots = entities.filter(entity => !entity.parentId || !known.has(entity.parentId));
  const selected = entities.find(entity => entity.id === selectedId) || roots[0];
  const toggle = (id: string) => setCollapsed(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  const node = (entity: CorporateEntity, ancestors: string[] = []): ReactNode => {
    if (ancestors.includes(entity.id)) return null;
    const children = entities.filter(item => item.parentId === entity.id);
    const expanded = !collapsed.includes(entity.id);
    return <div key={entity.id} className="flex flex-col items-center">
      <div className={`w-56 rounded-xl border-2 bg-white p-3 text-left shadow-sm ${selected?.id === entity.id ? 'border-blue-600 ring-4 ring-blue-50' : 'border-slate-200'}`}>
        <button onClick={() => setSelectedId(entity.id)} className="w-full text-left"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-blue-700" /><span className="line-clamp-2 text-sm font-bold text-blue-950">{entity.displayName || entity.legalName}</span></div><div className="mt-2 text-[11px] text-slate-500">{entity.entityType.replaceAll('_', ' ')} · {entity.registrationNumber || 'Registration withheld'}</div><div className="mt-1 text-[11px] text-slate-500">{entity.principalActivities.length} activities · {entity.sites.length} sites</div></button>
        {children.length > 0 && <button onClick={() => toggle(entity.id)} className="mt-2 flex items-center gap-1 text-xs font-bold text-blue-700">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{children.length} linked {children.length === 1 ? 'entity' : 'entities'}</button>}
      </div>
      {expanded && children.length > 0 && <><div className="h-6 w-px bg-slate-300" /><div className="flex border-t border-slate-300">{children.map(child => <div key={child.id} className="relative px-3 pt-5 before:absolute before:left-1/2 before:top-0 before:h-5 before:w-px before:bg-slate-300">{node(child, [...ancestors, entity.id])}</div>)}</div></>}
    </div>;
  };

  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-blue-700" /><h2 className="font-bold text-blue-950">Group legal-entity map</h2></div><p className="mt-2 text-sm text-slate-600">Select a company to see its activities, sites and responsible people. Incoming records should match its legal name, registration number or aliases; ambiguous matches require review.</p>
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50 p-6"><div className="flex min-w-max items-start justify-center gap-8">{roots.map(entity => node(entity))}{!roots.length && <div className="min-w-[240px] rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-500">Add your first legal entity below.</div>}</div></div>
    {selected && <div className="mt-5 grid gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-3"><div><div className="text-xs font-bold uppercase text-blue-700">Selected entity</div><div className="mt-1 font-bold text-blue-950">{selected.legalName}</div><div className="mt-1 text-xs text-slate-500">{selected.jurisdiction} · {selected.registrationNumber || 'Registration withheld'}</div><div className="mt-2 text-xs text-slate-600">Aliases: {selected.aliases.join(', ') || 'None'}</div></div><div><div className="text-xs font-bold uppercase text-blue-700">Work and locations</div><div className="mt-2 text-xs text-slate-700">Activities: {selected.principalActivities.join(', ') || 'Not configured'}</div><div className="mt-2 text-xs text-slate-700">Business units: {selected.businessUnits.join(', ') || 'Not configured'}</div><div className="mt-2 text-xs text-slate-700">Sites: {selected.sites.join(', ') || 'Not configured'}</div></div><div><div className="text-xs font-bold uppercase text-blue-700">Accountable roles</div><div className="mt-2 space-y-1 text-xs text-slate-700">{selected.roleAssignments.map(role => <div key={role.id}><strong>{role.role.replaceAll('_', ' ')}:</strong> {role.name || 'Unassigned'}</div>)}{!selected.roleAssignments.length && 'No PIC assigned'}</div></div></div>}
  </section>;
}
