import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { BellRing, Building2, ChartNoAxesCombined, ChevronDown, ClipboardCheck, FilePenLine, Files, FileSearch, FileStack, Gauge, GitBranch, Inbox, LayoutDashboard, ListTodo, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Truck, Upload, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEntity } from '../context/EntityContext';

type NavItem = { to: string; label: string; icon: LucideIcon; adminOnly?: boolean };
type NavGroup = { id: string; label: string; icon: LucideIcon; to: string; matches: (path: string) => boolean; children: NavItem[] };

const workspace: NavItem[] = [
  { to: '/my-work', label: 'My Work', icon: ListTodo },
  { to: '/intake', label: 'Intake Queue', icon: Inbox },
  { to: '/executive', label: 'Executive Overview', icon: ChartNoAxesCombined },
];
const groups: NavGroup[] = [
  { id: 'asset', label: 'Asset Monitoring', icon: Truck, to: '/assets', matches: path => ['/', '/assets', '/drivers', '/asset-documents'].includes(path), children: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/assets', label: 'Asset Register', icon: Truck },
    { to: '/drivers', label: 'Driver Register', icon: Users },
    { to: '/asset-documents', label: 'Evidence Queue', icon: FileStack },
    { to: '/workflow-studio?module=ASSET', label: 'Prompt Studio', icon: GitBranch, adminOnly: true },
  ] },
  { id: 'compliance', label: 'Compliance', icon: ClipboardCheck, to: '/compliance', matches: path => path === '/compliance', children: [
    { to: '/compliance', label: 'Checklist Prototype', icon: ClipboardCheck },
    { to: '/workflow-studio?module=COMPLIANCE', label: 'Prompt Studio', icon: GitBranch, adminOnly: true },
  ] },
  { id: 'contract', label: 'Contract Management', icon: Files, to: '/contracts', matches: path => path === '/contracts', children: [
    { to: '/contracts', label: 'Contract Workflow', icon: GitBranch },
    { to: '/contracts?view=dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/contracts?view=register', label: 'Register', icon: FileSearch },
    { to: '/contracts?view=smart-files', label: 'Smart Files', icon: Upload },
    { to: '/contracts?view=drafting', label: 'Drafting', icon: FilePenLine },
    { to: '/contracts?view=monitoring', label: 'Monitoring', icon: BellRing },
    { to: '/contracts?view=configuration', label: 'Rules & Templates', icon: ShieldCheck, adminOnly: true },
    { to: '/workflow-studio?module=CONTRACT', label: 'Prompt Studio', icon: GitBranch, adminOnly: true },
  ] },
  { id: 'vendor', label: 'Vendor Management', icon: Building2, to: '/vendors', matches: path => path === '/vendors', children: [
    { to: '/vendors', label: 'Onboarding Workflow', icon: GitBranch },
    { to: '/vendors?view=dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/vendors?view=register', label: 'Vendor Register', icon: Building2 },
    { to: '/vendors?view=followups', label: 'Follow-ups', icon: ListTodo },
    { to: '/vendors?view=expiries', label: 'Expiries', icon: BellRing },
    { to: '/vendors?view=performance', label: 'Performance', icon: Gauge },
    { to: '/vendors?view=rules', label: 'Rules', icon: ShieldCheck, adminOnly: true },
    { to: '/workflow-studio?module=VENDOR', label: 'Prompt Studio', icon: GitBranch, adminOnly: true },
  ] },
];
const administration: NavItem[] = [
  { to: '/contracts?view=structure', label: 'Corporate Structure', icon: Building2 },
  { to: '/settings', label: 'Settings & Accounts', icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { entities, selectedEntityId, setSelectedEntityId } = useEntity();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(localStorage.getItem('sidebarCollapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeGroup = location.pathname === '/workflow-studio'
    ? ({ ASSET: 'asset', DRIVER: 'asset', COMPLIANCE: 'compliance', CONTRACT: 'contract', VENDOR: 'vendor' } as Record<string, string>)[new URLSearchParams(location.search).get('module') || '']
    : groups.find(group => group.matches(location.pathname))?.id;
  const [openGroup, setOpenGroup] = useState(activeGroup || 'asset');
  useEffect(() => { if (activeGroup) setOpenGroup(activeGroup); setMobileOpen(false); }, [activeGroup, location.pathname, location.search]);
  const toggle = () => setCollapsed(value => { localStorage.setItem('sidebarCollapsed', String(!value)); return !value; });
  const active = (to: string) => {
    const [pathname, query] = to.split('?');
    if (location.pathname !== pathname) return false;
    if (!query) return !location.search;
    return location.search === `?${query}`;
  };
  const link = (item: NavItem, nested = false) => {
    if (item.adminOnly && user?.role !== 'GROUP_ADMIN') return null;
    if (item.to === '/executive' && !['GROUP_ADMIN', 'EXECUTIVE'].includes(user?.role || '')) return null;
    const Icon = item.icon;
    return <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)} title={item.label} aria-current={active(item.to) ? 'page' : undefined} className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${nested ? 'ml-4 border-l border-blue-500/50 pl-3' : ''} ${active(item.to) ? 'bg-amber-400 font-bold text-blue-950' : 'text-blue-100 hover:bg-blue-700 hover:text-white'} ${collapsed ? 'md:justify-center md:px-2' : ''}`}><Icon className="h-4 w-4 shrink-0" /><span className={collapsed ? 'md:hidden' : ''}>{item.label}</span></Link>;
  };
  return <>
    <button type="button" onClick={() => setMobileOpen(value => !value)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} className="fixed left-3 top-3 z-[80] rounded-lg bg-blue-900 p-2.5 text-white shadow-lg md:hidden">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
    {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-[60] bg-slate-950/50 md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-[70] flex w-[264px] shrink-0 flex-col bg-[#1e3a8a] text-white shadow-xl transition-[transform,width] duration-200 md:static md:z-auto md:translate-x-0 md:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:w-[68px]' : 'md:w-[224px]'}`}>
      <div className="flex items-center justify-between border-b border-blue-700/60 px-4 py-4"><div className={`text-lg font-black tracking-tight ${collapsed ? 'md:hidden' : ''}`}><span className="text-rose-300">Axcel</span><span className="text-sky-300">asia</span></div><button type="button" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden rounded-lg p-2 text-blue-100 hover:bg-blue-700 md:block">{collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</button></div>
      <div className={`border-b border-blue-700/60 px-3 py-3 ${collapsed ? 'md:hidden' : ''}`}><label htmlFor="sidebar-entity" className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Viewing entity</label><select id="sidebar-entity" className="mt-1 w-full rounded-lg border border-blue-600 bg-blue-900 px-2 py-2 text-xs text-white" value={selectedEntityId} onChange={event => setSelectedEntityId(event.target.value)}>{['GROUP_ADMIN', 'EXECUTIVE'].includes(user?.role || '') && <option value="">All permitted entities</option>}{entities.filter(entity => entity.active).map(entity => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></div>
      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
        <div><div className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-[.15em] text-blue-300 ${collapsed ? 'md:hidden' : ''}`}>Workspace</div><div className="space-y-0.5">{user?.role === 'EXECUTIVE' ? link({ to: '/executive', label: 'Executive Overview', icon: ChartNoAxesCombined }) : workspace.map(item => link(item))}</div></div>
        {user?.role !== 'EXECUTIVE' && <div><div className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-[.15em] text-blue-300 ${collapsed ? 'md:hidden' : ''}`}>Modules</div><div className="space-y-1">{groups.map(group => { const Icon = group.icon; const expanded = openGroup === group.id; return <div key={group.id}><div className={`flex items-center rounded-lg ${activeGroup === group.id ? 'bg-blue-700/70' : 'hover:bg-blue-700/50'}`}><Link to={group.to} onClick={() => { setOpenGroup(group.id); setMobileOpen(false); }} title={group.label} className={`flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${collapsed ? 'md:justify-center md:px-2' : ''}`}><Icon className="h-5 w-5 shrink-0" /><span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>{group.label}</span></Link><button type="button" onClick={() => setOpenGroup(expanded ? '' : group.id)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.label} sections`} aria-expanded={expanded} className={`mr-1 rounded p-1 text-blue-100 hover:bg-blue-600 ${collapsed ? 'md:hidden' : ''}`}><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button></div>{expanded && <div className={`mt-0.5 space-y-0.5 ${collapsed ? 'md:hidden' : ''}`}>{group.children.map(item => link(item, true))}</div>}</div>; })}</div></div>}
        <div><div className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-[.15em] text-blue-300 ${collapsed ? 'md:hidden' : ''}`}>Administration</div><div className="space-y-0.5">{(user?.role === 'EXECUTIVE' ? administration.slice(1) : administration).map(item => link(item))}</div></div>
      </nav>
      <div className="border-t border-blue-700/60 p-3"><div className={`truncate px-2 pb-2 text-xs text-blue-100 ${collapsed ? 'md:hidden' : ''}`}>{user?.name} · {user?.role.replaceAll('_', ' ')}</div><button onClick={() => void logout()} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-200 hover:bg-blue-700 hover:text-white ${collapsed ? 'md:justify-center md:px-2' : ''}`}><LogOut className="h-5 w-5 shrink-0" /><span className={collapsed ? 'md:hidden' : ''}>Sign Out</span></button></div>
    </aside>
  </>;
}
