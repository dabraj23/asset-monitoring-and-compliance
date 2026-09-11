import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Truck, ClipboardCheck, Settings, LogOut } from 'lucide-react';

export function Sidebar() {
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/assets', icon: Truck, label: 'Fleet Assets' },
    { to: '/compliance', icon: ClipboardCheck, label: 'Compliance' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-64 bg-[#1e3a8a] text-white h-screen flex flex-col shrink-0">
      <div className="p-6 flex flex-col items-center border-b border-blue-800/50">
        <div className="bg-white px-3 py-4 rounded-lg shadow-md mb-4 flex flex-col items-center justify-center w-full">
          <div className="flex items-baseline mb-1">
            <span className="text-4xl font-black text-[#c82027] tracking-tighter leading-none">Axcel</span>
            <span className="text-4xl font-black text-[#0075c9] tracking-tighter leading-none">asia</span>
          </div>
          <div className="w-full h-[3px] bg-black mb-[2px]"></div>
          <div className="w-full h-[1px] bg-black mb-1"></div>
          <span className="text-[7.5px] tracking-[0.3em] font-semibold text-black uppercase italic w-full text-center">
            Accelerating Success
          </span>
        </div>
        <p className="text-[10px] text-blue-200 uppercase tracking-widest mt-1">Fleet Command</p>
      </div>
      
      <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-yellow-500 text-blue-900 shadow-md'
                  : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      
      <div className="p-4 border-t border-blue-800/50">
        <button className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-blue-200 hover:text-white hover:bg-blue-800/50 rounded-lg transition-colors">
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
