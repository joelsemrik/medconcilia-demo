import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { DoctorList } from './components/DoctorList';
import { DataUpload } from './components/DataUpload';
import { Dashboard } from './components/Dashboard';
import { Checks } from './components/Checks';
import { Reports } from './components/Reports';
import { TabView } from './types';

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabView>('doctors');

  const renderContent = () => {
    switch (activeTab) {
      case 'doctors':
        return <DoctorList />;
      case 'consultations':
        return <DataUpload type="consultations" />;
      case 'liquidations':
        return <DataUpload type="liquidations" />;
      case 'dashboard':
        return <Dashboard />;
      case 'checks':
        return <Checks />;
      case 'reports':
        return <Reports />;
      default:
        return <DoctorList />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
};

export default App;