import { useState, type ReactNode } from 'react';
import { Building2, ChevronDown, ChevronRight, GitBranch } from 'lucide-react';
import type { CorporateEntity, CorporateOwnershipInterest } from '../contractTypes';

type OwnershipEdge = { entity: CorporateEntity; interest?: CorporateOwnershipInterest };

export function CorporateStructureChart({ entities }: { entities: CorporateEntity[] }) {
  const [selectedId, setSelectedId] = useState(entities[0]?.id || '');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const visibleEntities = entities.filter(entity => entity.active);
  const known = new Set(visibleEntities.map(entity => entity.id));
  const interestsFor = (entity: CorporateEntity) => entity.ownershipInterests || [];
  const visibleInterestsFor = (entity: CorporateEntity) => interestsFor(entity).filter(interest => known.has(interest.ownerEntityId));
  const roots = visibleEntities.filter(entity => !visibleInterestsFor(entity).length && (!entity.parentId || !known.has(entity.parentId)));
  const selected = visibleEntities.find(entity => entity.id === selectedId) || roots[0];
  const toggle = (path: string) => setCollapsed(current => current.includes(path) ? current.filter(item => item !== path) : [...current, path]);
  const childrenOf = (ownerId: string): OwnershipEdge[] => visibleEntities.flatMap(entity => {
    const interests = visibleInterestsFor(entity).filter(interest => interest.ownerEntityId === ownerId);
    if (interests.length) return interests.map(interest => ({ entity, interest }));
    return !visibleInterestsFor(entity).length && entity.parentId === ownerId ? [{ entity }] : [];
  });
  const ownershipLabel = (interest?: CorporateOwnershipInterest) => interest?.percentage !== undefined
    ? `${interest.percentage}% ownership`
    : interest ? interest.relationship.replaceAll('_', ' ').toLowerCase() : '';

  const node = (entity: CorporateEntity, path: string, interest?: CorporateOwnershipInterest, ancestors: string[] = []): ReactNode => {
    if (ancestors.includes(entity.id)) return null;
    const children = childrenOf(entity.id);
    const expanded = !collapsed.includes(path);
    return <div key={path} className="relative">
      <div className={`relative z-10 flex max-w-xl items-stretch overflow-hidden rounded-xl border-2 shadow-sm ${selected?.id === entity.id ? 'border-amber-300 bg-blue-950 ring-4 ring-blue-100' : 'border-blue-500 bg-blue-800'}`}>
        <button onClick={() => setSelectedId(entity.id)} className="min-w-0 flex-1 p-3 text-left text-white">
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-blue-100" /><span className="text-sm font-bold">{entity.legalName}</span></div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-blue-100"><span>{entity.entityType.replaceAll('_', ' ')}</span>{interest && <span className="rounded-full bg-white/15 px-2 py-0.5 font-bold text-white">{ownershipLabel(interest)}</span>}</div>
        </button>
        {children.length > 0 && <button onClick={() => toggle(path)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entity.legalName}`} className="border-l border-white/20 px-3 text-white">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}
      </div>
      {expanded && children.length > 0 && <div className="ml-7 border-l-2 border-amber-300 pl-6 pt-3"><div className="space-y-3">{children.map(({ entity: child, interest: childInterest }, index) => <div key={`${path}:${child.id}:${index}`} className="relative before:absolute before:-left-6 before:top-6 before:h-0.5 before:w-6 before:bg-amber-300">{node(child, `${path}/${child.id}/${index}`, childInterest, [...ancestors, entity.id])}</div>)}</div></div>}
    </div>;
  };

  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-blue-700" /><h2 className="font-bold text-blue-950">Group legal-entity and ownership map</h2></div><p className="mt-2 text-sm text-slate-600">One company may appear under more than one shareholder. Workflow routing still uses its operational parent, while ownership percentages remain separate, editable evidence.</p>
    <div className="mt-5 overflow-x-auto rounded-xl bg-gradient-to-br from-blue-950 to-blue-800 p-6"><div className="min-w-[620px] space-y-6">{roots.map(entity => node(entity, entity.id))}{!roots.length && <div className="rounded-lg border border-dashed border-blue-300 bg-white/10 p-6 text-center text-sm text-blue-100">Add your first legal entity below.</div>}</div></div>
    {selected && <div className="mt-5 grid gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-3"><div><div className="text-xs font-bold uppercase text-blue-700">Selected entity</div><div className="mt-1 font-bold text-blue-950">{selected.legalName}</div><div className="mt-1 text-xs text-slate-500">{selected.jurisdiction} · {selected.registrationNumber || 'Registration pending'}</div><div className="mt-2 text-xs text-slate-600">Aliases: {selected.aliases.join(', ') || 'None'}</div></div><div><div className="text-xs font-bold uppercase text-blue-700">Ownership interests</div><div className="mt-2 space-y-1 text-xs text-slate-700">{interestsFor(selected).map(interest => <div key={interest.ownerEntityId}><strong>{entities.find(entity => entity.id === interest.ownerEntityId)?.legalName || 'Unknown entity'}:</strong> {interest.percentage !== undefined ? `${interest.percentage}%` : 'Percentage pending'} · {interest.relationship.replaceAll('_', ' ').toLowerCase()}</div>)}{!interestsFor(selected).length && 'Top-level company or ownership not yet recorded'}</div></div><div><div className="text-xs font-bold uppercase text-blue-700">Work and accountable roles</div><div className="mt-2 text-xs text-slate-700">Activities: {selected.principalActivities.join(', ') || 'Not configured'}</div><div className="mt-2 space-y-1 text-xs text-slate-700">{selected.roleAssignments.map(role => <div key={role.id}><strong>{role.role.replaceAll('_', ' ')}:</strong> {role.name || 'Unassigned'}</div>)}{!selected.roleAssignments.length && 'No PIC assigned'}</div></div></div>}
  </section>;
}
