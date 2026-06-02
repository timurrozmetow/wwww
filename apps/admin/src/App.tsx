import { useState } from 'react';
import { useAuthStore } from './store/auth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { EconomyPage } from './pages/EconomyPage';
import { VpnPage } from './pages/VpnPage';
import { AdsPage } from './pages/AdsPage';
import { RemoteConfigPage } from './pages/RemoteConfigPage';
import { EmergencyPage } from './pages/EmergencyPage';
import { FraudPage } from './pages/FraudPage';
import { NotificationsPage } from './pages/NotificationsPage';

type Tab =
  | 'dashboard'
  | 'devices'
  | 'vpn'
  | 'ads'
  | 'emergency'
  | 'fraud'
  | 'notifications'
  | 'economy'
  | 'config';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'devices', label: 'Devices' },
  { key: 'vpn', label: 'VPN' },
  { key: 'ads', label: 'Ads' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'fraud', label: 'Fraud' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'economy', label: 'Economy' },
  { key: 'config', label: 'Remote Config' },
];

function TabContent({ tab }: { tab: Tab }) {
  if (tab === 'dashboard') return <DashboardPage />;
  if (tab === 'devices') return <DevicesPage />;
  if (tab === 'vpn') return <VpnPage />;
  if (tab === 'ads') return <AdsPage />;
  if (tab === 'emergency') return <EmergencyPage />;
  if (tab === 'fraud') return <FraudPage />;
  if (tab === 'notifications') return <NotificationsPage />;
  if (tab === 'economy') return <EconomyPage />;
  return <RemoteConfigPage />;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const admin = useAuthStore((s) => s.admin);
  const logout = useAuthStore((s) => s.logout);
  const [tab, setTab] = useState<Tab>('dashboard');

  if (!token) return <LoginPage />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold">VPN Admin</span>
            <nav className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{admin?.email}</span>
            <button
              onClick={logout}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <TabContent tab={tab} />
      </main>
    </div>
  );
}
