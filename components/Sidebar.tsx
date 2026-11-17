import React from 'react';
import { Users, FileSpreadsheet, Activity, Stethoscope, FileText, CheckSquare } from 'lucide-react';
import { TabView } from '../types';

interface SidebarProps {
  activeTab: TabView;
  setActiveTab: (tab: TabView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'doctors', label: 'Médicos (Clientes)', icon: Users },
    { id: 'consultations', label: 'Consultas', icon: Stethoscope },
    { id: 'liquidations', label: 'Liquidaciones', icon: FileSpreadsheet },
    { id: 'dashboard', label: 'Conciliación', icon: Activity },
    { id: 'checks', label: 'Checks', icon: CheckSquare },
    { id: 'reports', label: 'Reportes', icon: FileText },
  ];

  return (
    <div className="w-64 bg-teal-900 text-white min-h-screen flex flex-col shadow-xl z-10">
      <div className="p-6 border-b border-teal-800">
        <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-emerald-400" />
            MedConcilia
        </h1>
        <p className="text-xs text-teal-300 mt-1">Gestión de Facturación</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id as TabView)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-teal-700 text-white shadow-lg border-l-4 border-emerald-400'
                      : 'text-teal-100 hover:bg-teal-800 hover:text-white'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="p-4 border-t border-teal-800">
        <p className="text-xs text-teal-400 text-center">v1.0.0 &copy; 2024</p>
      </div>
    </div>
  );
};