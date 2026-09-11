import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Area
} from 'recharts';
import { Calendar, ChevronDown } from 'lucide-react';
import { ComplianceMap } from './ComplianceMap';

const REGION_DATA = [
  { name: 'KV Central', passed: 53, failed: 48 },
  { name: 'KV South', passed: 42, failed: 49 },
  { name: 'KV North', passed: 40, failed: 52 },
  { name: 'East Coast', passed: 43, failed: 53 },
  { name: 'Northern', passed: 45, failed: 53 },
  { name: 'Southern', passed: 47, failed: 47 },
];

const COMPLIANCE_DATA = [
  { name: 'Passed', value: 38, color: '#4F81BD' },
  { name: 'Failed', value: 62, color: '#C0504D' },
];

const ACTIVITY_DATA = [
  { month: 'Jan', count: 120, duration: 1500 },
  { month: 'Feb', count: 132, duration: 1600 },
  { month: 'Mar', count: 101, duration: 1400 },
  { month: 'Apr', count: 134, duration: 1550 },
  { month: 'May', count: 90, duration: 1200 },
  { month: 'Jun', count: 230, duration: 1800 },
  { month: 'Jul', count: 210, duration: 1750 },
  { month: 'Aug', count: 250, duration: 1900 },
  { month: 'Sep', count: 220, duration: 1850 },
  { month: 'Oct', count: 200, duration: 1700 },
  { month: 'Nov', count: 280, duration: 2100 },
  { month: 'Dec', count: 260, duration: 2000 },
];

const STATUS_CARDS = [
  { title: 'New', value: 13, color: 'bg-gray-200 text-gray-700' },
  { title: 'WIP', value: 61, color: 'bg-[#8CC63F] text-white' },
  { title: 'Due Soon', value: 0, color: 'bg-[#FFA500] text-white' },
  { title: 'Overdue', value: 0, color: 'bg-[#FF0000] text-white' },
  { title: 'Closed', value: 199, color: 'bg-gray-500 text-white' },
  { title: 'Total', value: 273, color: 'bg-[#0070C0] text-white' },
];

export function ComplianceDashboard() {
  const [dateRange, setDateRange] = useState('1 Feb 2025 - 28 Feb 2025');

  const FilterDropdown = ({ label }: { label: string }) => (
    <div className="relative group">
      <button className="flex items-center justify-between w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        <span className="text-gray-600 truncate mr-2">{label}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] gap-4 p-2 overflow-hidden">
      {/* Header & Filters Row */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-[#00529B]">Store Performance Dashboard</h1>
            <p className="text-xs text-gray-500">Compliance Audit & Inspection Overview</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              {dateRange}
            </button>
          </div>
        </div>

        {/* Filters - Compact */}
        <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100">
          <div className="grid grid-cols-6 gap-2">
            <FilterDropdown label="Custom Status" />
            <FilterDropdown label="Type" />
            <FilterDropdown label="Sub Type" />
            <FilterDropdown label="Department" />
            <FilterDropdown label="Customer" />
            <FilterDropdown label="Priority" />
          </div>
        </div>

        {/* KPI Cards - Compact */}
        <div className="grid grid-cols-6 gap-2">
          {STATUS_CARDS.map((card) => (
            <div key={card.title} className={`${card.color} rounded-lg p-2 text-center shadow-sm flex flex-col items-center justify-center h-16`}>
              <span className="text-xs font-medium opacity-90 mb-0.5">{card.title}</span>
              <span className="text-xl font-bold leading-none">{card.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Grid - Fills remaining height */}
      <div className="grid grid-cols-12 gap-4 min-h-0 flex-1">
        {/* Left Column: Map (Spans full height of this section) */}
        <div className="col-span-4 bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-sm font-bold text-gray-800 mb-2 shrink-0">Compliance Issues Map</h3>
          <div className="flex-1 w-full min-h-0 relative rounded-lg overflow-hidden">
            <ComplianceMap />
          </div>
        </div>

        {/* Right Column: Charts Grid */}
        <div className="col-span-8 grid grid-rows-2 gap-4 min-h-0">
          {/* Top Row: Bar & Pie */}
          <div className="grid grid-cols-2 gap-4 min-h-0">
            {/* Bar Chart */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
              <h3 className="text-sm font-bold text-gray-800 mb-2 shrink-0">Fire Safety Compliance</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={REGION_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} width={30} />
                    <Tooltip 
                      contentStyle={{ fontSize: '12px', padding: '8px' }}
                      cursor={{ fill: '#f3f4f6' }}
                    />
                    <Legend iconType="square" wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="passed" name="Passed" fill="#4F81BD" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" name="Failed" fill="#C0504D" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
              <h3 className="text-sm font-bold text-gray-800 mb-2 shrink-0">Compliance Breakdown</h3>
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={COMPLIANCE_DATA}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius="80%"
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {COMPLIANCE_DATA.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: '12px', padding: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Row: Activity Chart */}
          <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <h3 className="text-sm font-bold text-gray-800">Total Activity by Month</h3>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#17C5C2] rounded-sm"></div>
                  <span className="text-gray-600">Count</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#A78BFA] rounded-full"></div>
                  <span className="text-gray-600">Duration</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={ACTIVITY_DATA} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#A78BFA" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} dy={5} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} width={30} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} width={30} />
                  <Tooltip contentStyle={{ fontSize: '12px', padding: '8px' }} />
                  <Bar dataKey="count" yAxisId="left" fill="#17C5C2" barSize={30} radius={[4, 4, 0, 0]} />
                  <Area type="monotone" dataKey="duration" yAxisId="right" stroke="#A78BFA" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
