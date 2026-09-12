import React, { useState, useEffect } from 'react';
import { Bell, Shield, User, Building, Save, Moon, Sun, Globe, Key, Eye, EyeOff, Loader2, CheckCircle2, XCircle, Wifi } from 'lucide-react';
import { toast } from 'sonner';

export function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiBusy, setApiBusy] = useState<'test' | 'save' | ''>('');
  const [testedKey, setTestedKey] = useState('');
  const [apiStatus, setApiStatus] = useState<{ configured: boolean; success?: boolean; model?: string; latencyMs?: number; lastTestedAt?: string; message?: string }>({ configured: false });

  useEffect(() => {
    fetch('/api/settings/api-key/status').then(response => response.json()).then(setApiStatus).catch(() => undefined);
  }, []);

  const testConnection = async (saveAfterTest = false) => {
    if (!apiKey.trim()) return toast.error('Enter a Gemini API key first.');
    setApiBusy(saveAfterTest ? 'save' : 'test');
    try {
      const testResponse = await fetch('/api/settings/api-key/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const testResult = await testResponse.json();
      setApiStatus(current => ({ ...current, ...testResult }));
      if (!testResponse.ok) throw new Error(testResult.message || 'Gemini connection test failed.');
      setTestedKey(apiKey.trim());
      if (saveAfterTest) {
        const saveResponse = await fetch('/api/settings/api-key', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: apiKey.trim() }),
        });
        const saveResult = await saveResponse.json();
        if (!saveResponse.ok) throw new Error(saveResult.message || 'The verified key could not be activated.');
        localStorage.setItem('geminiApiKey', apiKey.trim());
        setApiStatus(current => ({ ...current, configured: true, success: true, message: 'Gemini connection verified and activated.' }));
        toast.success('Gemini key tested and activated.');
      } else {
        toast.success('Gemini connection verified.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gemini connection test failed.');
    } finally {
      setApiBusy('');
    }
  };

  const handleSave = async () => {
    if (activeTab === 'apikeys') {
      await testConnection(true);
    } else {
      toast.success('Settings saved successfully!');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a8a]">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account and application preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Settings Navigation */}
        <div className="space-y-1">
          {[
            { id: 'profile', label: 'Profile Settings', icon: User },
            { id: 'company', label: 'Company Info', icon: Building },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'security', label: 'Security', icon: Shield },
            { id: 'preferences', label: 'Preferences', icon: Globe },
            { id: 'apikeys', label: 'API Keys', icon: Key },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Settings Content */}
        <div className="md:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-4">Profile Settings</h2>
              
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden border-4 border-white shadow-md">
                  <img src="https://randomuser.me/api/portraits/men/32.jpg" alt="Profile" className="w-full h-full object-cover" />
                </div>
                <div>
                  <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                    Change Avatar
                  </button>
                  <p className="text-xs text-gray-500 mt-2">JPG, GIF or PNG. Max size of 800K</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  <input type="text" defaultValue="Admin" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <input type="text" defaultValue="User" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                  <input type="email" defaultValue="admin@lshfleet.com" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                  <input type="text" defaultValue="Fleet Manager" disabled className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2 text-gray-500" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'company' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-4">Company Information</h2>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                  <input type="text" defaultValue="LSH Fleet Command" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Registration Number</label>
                  <input type="text" defaultValue="1234567-X" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <textarea rows={3} defaultValue="123 Fleet Street, Industrial Park, 50000 Kuala Lumpur" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-4">Notification Preferences</h2>
              
              <div className="space-y-4">
                {[
                  { title: 'Email Notifications', desc: 'Receive daily summary emails' },
                  { title: 'Push Notifications', desc: 'Receive alerts for critical issues' },
                  { title: 'Maintenance Alerts', desc: 'Notify when assets are due for maintenance' },
                  { title: 'Compliance Warnings', desc: 'Notify when documents are expiring soon' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{item.title}</h4>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-4">Security Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
                  <input type="password" placeholder="••••••••" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                  <input type="password" placeholder="••••••••" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                  <input type="password" placeholder="••••••••" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="pt-4">
                  <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                    Update Password
                  </button>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-md font-bold text-gray-900 mb-4">Two-Factor Authentication</h3>
                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Protect your account with 2FA</p>
                    <p className="text-sm text-gray-500">Currently disabled</p>
                  </div>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    Enable 2FA
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-4">Application Preferences</h2>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                  <select className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option>English (US)</option>
                    <option>Bahasa Melayu</option>
                    <option>中文 (Chinese)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                  <select className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option>Asia/Kuala_Lumpur (GMT+8)</option>
                    <option>Asia/Singapore (GMT+8)</option>
                    <option>UTC</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
                  <div className="flex gap-4">
                    <button className="flex-1 flex items-center justify-center gap-2 border-2 border-blue-600 bg-blue-50 text-blue-700 py-3 rounded-lg font-medium">
                      <Sun className="w-5 h-5" />
                      Light Mode
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 py-3 rounded-lg font-medium transition-colors">
                      <Moon className="w-5 h-5" />
                      Dark Mode
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'apikeys' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><h2 className="text-lg font-bold text-gray-900">AI API & Connection</h2><p className="mt-1 text-sm text-gray-500">Controls contract intelligence, drafting and compliance analysis.</p></div><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${apiStatus.configured ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{apiStatus.configured ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{apiStatus.configured ? 'Key configured' : 'Not configured'}</span></div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gemini API Key</label>
                  <p className="text-xs leading-5 text-gray-500 mb-2">The test makes a minimal request to the configured Gemini model. The key is never returned by the server or written to logs.</p>
                  <div className="relative"><input type={showApiKey ? 'text' : 'password'} placeholder="AIzaSy..." value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestedKey(''); setApiStatus(current => ({ ...current, success: undefined, message: undefined })); }} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500" /><button type="button" aria-label={showApiKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowApiKey(value => !value)} className="absolute right-3 top-3 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">{showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-gray-400">Model</div><div className="mt-1 font-mono text-sm font-bold text-gray-800">{apiStatus.model || 'gemini-2.5-flash'}</div></div><div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-gray-400">Last connection test</div><div className="mt-1 text-sm font-bold text-gray-800">{apiStatus.lastTestedAt ? new Date(apiStatus.lastTestedAt).toLocaleString() : 'Not tested in this session'}</div>{apiStatus.latencyMs !== undefined && <div className="mt-1 text-xs text-gray-500">{apiStatus.latencyMs} ms response time</div>}</div></div>
                {apiStatus.message && <div className={`flex items-start gap-3 rounded-xl border p-4 ${apiStatus.success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{apiStatus.success ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}<div><div className="text-sm font-bold">{apiStatus.success ? 'Connection successful' : 'Connection failed'}</div><div className="mt-1 text-xs leading-5">{apiStatus.message}</div></div></div>}
                <div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(apiBusy) || !apiKey.trim()} onClick={() => testConnection(false)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-800 disabled:opacity-50">{apiBusy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}Test connection</button>{testedKey === apiKey.trim() && <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700"><CheckCircle2 className="h-4 w-4" />Current value verified</span>}</div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><strong>Demo key storage:</strong> after a successful test, the key is retained in this browser so it can be restored when the local server restarts. Production deployment should replace this with a managed secret vault and role-controlled administration.</div>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={Boolean(apiBusy) || (activeTab === 'apikeys' && !apiKey.trim())}
              className="flex items-center gap-2 bg-[#1e3a8a] text-white px-6 py-2 rounded-lg hover:bg-blue-800 font-medium transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {apiBusy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {activeTab === 'apikeys' ? 'Test & Activate Key' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
