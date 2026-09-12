import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Truck, ClipboardCheck, Settings, LogOut, Building2 } from 'lucide-react';

export function Sidebar() {
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/assets', icon: Truck, label: 'Asset Management' },
    { to: '/vendors', icon: Building2, label: 'Vendor Management' },
    { to: '/compliance', icon: ClipboardCheck, label: 'Compliance' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen w-20 shrink-0 flex-col bg-[#1e3a8a] text-white md:w-64">
      <div className="flex flex-col items-center border-b border-blue-800/50 p-3 md:p-6">
        <div className="mb-3 flex w-full flex-col items-center justify-center rounded-lg bg-white px-2 py-3 shadow-md md:mb-4 md:px-3 md:py-4">
          <div className="hidden items-baseline mb-1 md:flex">
            <span className="text-4xl font-black text-[#c82027] tracking-tighter leading-none">Axcel</span>
            <span className="text-4xl font-black text-[#0075c9] tracking-tighter leading-none">asia</span>
          </div>
          <div className="text-2xl font-black text-[#c82027] md:hidden">A</div>
          <div className="hidden w-full h-[3px] bg-black mb-[2px] md:block"></div>
          <div className="hidden w-full h-[1px] bg-black mb-1 md:block"></div>
          <span className="hidden text-[7.5px] tracking-[0.3em] font-semibold text-black uppercase italic w-full text-center md:block">
            Accelerating Success
          </span>
        </div>
        <p className="hidden text-[10px] text-blue-200 uppercase tracking-widest mt-1 md:block">Fleet Command</p>
      </div>
      
      <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-5 md:px-4 md:py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors md:justify-start md:px-4 ${
                isActive
                  ? 'bg-yellow-500 text-blue-900 shadow-md'
                  : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="hidden md:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      
      <div className="border-t border-blue-800/50 p-2 md:p-4">
        <button className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-800/50 hover:text-white md:justify-start md:px-4">
          <LogOut className="w-5 h-5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
