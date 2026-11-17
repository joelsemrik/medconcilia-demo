import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { RefreshCw, DollarSign, Clock, AlertTriangle, CheckCheck, Download, FileSpreadsheet, Search, X, Link, Check, Info, Calendar, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { exportToStyledExcel } from '../utils/excelExporter';
import { normalizeText, formatDate } from '../utils/excelParser';

export const Dashboard: React.FC = () => {
  const { selectedDoctorId, doctors, consultations, liquidations, reconcileData, manualReconciliation } = useApp();
  const currentDoctor = doctors.find(d => d.id === selectedDoctorId);

  // Filter for current doctor
  const docConsultations = useMemo(() => 
    consultations.filter(c => c.doctorId === selectedDoctorId), 
  [consultations, selectedDoctorId]);
  
  const docLiquidations = useMemo(() => 
    liquidations.filter(l => l.doctorId === selectedDoctorId), 
  [liquidations, selectedDoctorId]);

  const handleDownloadPendingExcel = () => {
    const pending = docConsultations.filter(c => !c.isReconciled);
    const data = pending.map(c => ({
      Fecha: formatDate(c.date),
      Paciente: c.patientName,
      Obra_Social: c.insurance,
      Estado: 'Pendiente'
    }));
    
    exportToStyledExcel({
      data,
      sheetName: 'Pendientes',
      title: 'Reporte de Consultas Pendientes de Conciliación',
      doctorName: currentDoctor ? `${currentDoctor.lastName}, ${currentDoctor.firstName}` : undefined,
      fileName: `Consultas_Pendientes_${currentDoctor?.lastName || 'Medico'}_${new Date().toISOString().split('T')[0]}.xlsx`
    });
  };

  // Derived Stats
  const totalConsultations = docConsultations.length;
  const reconciledCount = docConsultations.filter(c => c.isReconciled).length;
  const pendingCount = totalConsultations - reconciledCount;
  
  const totalLiquidationAmount = docLiquidations.reduce((sum, item) => sum + item.netAmount, 0);
  
  // Advanced Stats by Insurance
  const statsByInsurance = useMemo(() => {
    const stats: Record<string, { total: number, count: number, totalDelay: number, delayCount: number }> = {};

    // Process matched pairs
    docConsultations.forEach(cons => {
       if (cons.isReconciled && cons.liquidationId) {
           const liq = docLiquidations.find(l => l.id === cons.liquidationId);
           if (liq) {
               const insurance = cons.insurance.toUpperCase(); // Normalize for grouping
               if (!stats[insurance]) stats[insurance] = { total: 0, count: 0, totalDelay: 0, delayCount: 0 };
               
               stats[insurance].total += liq.netAmount;
               stats[insurance].count += 1;
               
               // Calculate Delay
               const paymentDate = new Date(liq.importDate).getTime();
               const serviceDate = new Date(cons.date).getTime();
               const days = Math.floor((paymentDate - serviceDate) / (1000 * 60 * 60 * 24));
               
               if (days >= 0) {
                   stats[insurance].totalDelay += days;
                   stats[insurance].delayCount += 1;
               }
           }
       }
    });

    return Object.entries(stats).map(([name, data]) => ({
        name,
        avgAmount: data.count > 0 ? Math.round(data.total / data.count) : 0,
        avgDelayDays: data.delayCount > 0 ? Math.round(data.totalDelay / data.delayCount) : 0,
        avgDelayMonths: data.delayCount > 0 ? parseFloat((data.totalDelay / data.delayCount / 30).toFixed(1)) : 0,
        total: data.total
    })).sort((a, b) => b.avgAmount - a.avgAmount); // Sort by average amount descending
  }, [docConsultations, docLiquidations]);

  // Calculate Weighted Global Average Delay
  const globalAvgDelayDays = statsByInsurance.length > 0
        ? statsByInsurance.reduce((acc, curr) => acc + (curr.avgDelayDays * curr.total), 0) / Math.max(statsByInsurance.reduce((acc, curr) => acc + curr.total, 0), 1)
        : 0;
  const globalAvgDelayMonths = (globalAvgDelayDays / 30).toFixed(1);

  // Pending consultations search and sort states
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingSortField, setPendingSortField] = useState<'date' | 'patientName' | 'insurance'>('date');
  const [pendingSortOrder, setPendingSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredAndSortedPendingConsultations = useMemo(() => {
    const list = docConsultations.filter(c => !c.isReconciled);
    
    // Filter
    const query = pendingSearch.trim().toLowerCase();
    const filtered = query 
      ? list.filter(c => 
          normalizeText(c.patientName).includes(query) || 
          normalizeText(c.insurance).includes(query) ||
          formatDate(c.date).includes(query)
        )
      : list;

    // Sort
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (pendingSortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (pendingSortField === 'patientName') {
        comparison = a.patientName.localeCompare(b.patientName);
      } else if (pendingSortField === 'insurance') {
        comparison = a.insurance.localeCompare(b.insurance);
      }
      return pendingSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [docConsultations, pendingSearch, pendingSortField, pendingSortOrder]);

  const handlePendingSort = (field: 'date' | 'patientName' | 'insurance') => {
    if (pendingSortField === field) {
      setPendingSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setPendingSortField(field);
      setPendingSortOrder(field === 'date' ? 'desc' : 'asc');
    }
  };

  // Manual reconciliation states
  const [selectedConsultation, setSelectedConsultation] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const openManualMatchModal = (consult: any) => {
    setSelectedConsultation(consult);
    // Find first significant word (at least 3 characters)
    const cleanName = consult.patientName.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").trim();
    const words = cleanName.split(/\s+/).filter((w: string) => w.length >= 3);
    setSearchQuery(words[0] || consult.patientName);
  };

  const unmatchedLiquidations = useMemo(() => {
    return docLiquidations.filter(l => !l.isMatched);
  }, [docLiquidations]);

  const candidateLiquidations = useMemo(() => {
    if (!selectedConsultation) return [];
    
    const query = searchQuery.toLowerCase().trim();
    
    return unmatchedLiquidations.map(liq => {
      const liqNameNorm = normalizeText(liq.patientName);
      const consultNameNorm = normalizeText(selectedConsultation.patientName);
      
      // Calculate a simple match score
      let score = 0;
      
      // Check for exact name match
      if (liqNameNorm === consultNameNorm) {
        score += 100;
      } else {
        // Count how many words of the searchQuery overlap
        const queryWords = query.split(/\s+/).filter(w => w.length >= 2);
        const liqWords = liqNameNorm.split(/\s+/);
        
        let wordMatches = 0;
        queryWords.forEach(qw => {
          if (liqWords.some(lw => lw.includes(qw) || qw.includes(lw))) {
            wordMatches += 1;
          }
        });
        
        if (wordMatches > 0) {
          score += (wordMatches / Math.max(queryWords.length, 1)) * 50;
        }
      }
      
      // Check insurance match
      const liqInsNorm = normalizeText(liq.insurance);
      const consultInsNorm = normalizeText(selectedConsultation.insurance);
      const insuranceMatch = liqInsNorm.includes(consultInsNorm) || consultInsNorm.includes(liqInsNorm);
      
      if (insuranceMatch) {
        score += 30;
      }
      
      return {
        ...liq,
        score,
        insuranceMatch
      };
    })
    .filter(liq => {
      if (!query) return true; // Show all if search is cleared
      return liq.score > 0 || normalizeText(liq.patientName).includes(query);
    })
    .sort((a, b) => b.score - a.score);
  }, [unmatchedLiquidations, selectedConsultation, searchQuery]);

  const handlePerformManualReconciliation = (liqId: string) => {
    if (!selectedConsultation) return;
    manualReconciliation(selectedConsultation.id, liqId);
    setSelectedConsultation(null);
  };

  if (!selectedDoctorId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p className="text-xl">Seleccione un médico para ver el tablero.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">Tablero de Conciliación</h2>
           <p className="text-slate-500 mt-1">
             Análisis financiero para <span className="font-semibold text-teal-600">{currentDoctor?.firstName} {currentDoctor?.lastName}</span>
           </p>
        </div>
        <button 
            onClick={reconcileData}
            className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-xl shadow-lg hover:bg-teal-700 hover:scale-105 transition-all"
        >
            <RefreshCw size={20} />
            Ejecutar Conciliación
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-cyan-50 text-cyan-600 rounded-lg">
                    <CheckCheck size={24} />
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Consultas Conciliadas</p>
                    <h4 className="text-2xl font-bold text-slate-800">{reconciledCount} <span className="text-sm font-normal text-slate-400">/ {totalConsultations}</span></h4>
                </div>
            </div>
            <div className="mt-4 w-full bg-slate-100 rounded-full h-2">
                <div className="bg-cyan-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${totalConsultations > 0 ? (reconciledCount/totalConsultations)*100 : 0}%` }}></div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Pendientes de Pago</p>
                    <h4 className="text-2xl font-bold text-slate-800">{pendingCount}</h4>
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                    <DollarSign size={24} />
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Monto Total Liquidado</p>
                    <h4 className="text-2xl font-bold text-slate-800">${totalLiquidationAmount.toLocaleString()}</h4>
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
                    <Clock size={24} />
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Promedio Demora Pago</p>
                    <h4 className="text-2xl font-bold text-slate-800">
                        {globalAvgDelayMonths} meses
                    </h4>
                </div>
            </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Delay Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Demora de Pago (Meses)</h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsByInsurance} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                        <Tooltip 
                            formatter={(value) => `${value} meses`}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{fill: '#f1f5f9'}}
                        />
                        {/* Teal Bar */}
                        <Bar dataKey="avgDelayMonths" name="Meses Promedio" fill="#0d9488" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Amount Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
             <h3 className="text-lg font-bold text-slate-800 mb-6">Valor Promedio por Consulta ($)</h3>
             <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsByInsurance}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-15} textAnchor="end" />
                        <YAxis />
                        <Tooltip 
                            formatter={(value) => `$${value}`}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        {/* Emerald Bar */}
                        <Bar dataKey="avgAmount" name="Valor Promedio" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>
      
      {/* Detailed Unmatched Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                  <h3 className="text-lg font-bold text-slate-800">Consultas Pendientes (No Conciliadas)</h3>
                  <p className="text-xs text-slate-500 mt-1">
                      Se muestran todas las consultas pendientes de cobro ({filteredAndSortedPendingConsultations.length}). Haga clic en las cabeceras para ordenar.
                  </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  {/* Search Bar */}
                  <div className="relative w-full md:w-64">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                          type="text"
                          value={pendingSearch}
                          onChange={(e) => setPendingSearch(e.target.value)}
                          placeholder="Buscar paciente u obra social..."
                          className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder-slate-400 font-medium"
                      />
                      {pendingSearch && (
                          <button
                              onClick={() => setPendingSearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              title="Limpiar búsqueda"
                          >
                              <X size={14} />
                          </button>
                      )}
                  </div>

                  {/* Excel Download Button */}
                  {docConsultations.filter(c => !c.isReconciled).length > 0 && (
                      <button
                          onClick={handleDownloadPendingExcel}
                          className="flex items-center gap-2 px-4 py-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl shadow-sm transition-all hover:scale-102 text-xs cursor-pointer w-full md:w-auto justify-center"
                          title="Descargar consultas pendientes en Excel"
                      >
                          <FileSpreadsheet size={16} />
                          Descargar Pendientes (.xlsx)
                      </button>
                  )}
              </div>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                          <th 
                              className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                              onClick={() => handlePendingSort('date')}
                          >
                              <div className="flex items-center gap-1.5">
                                  Fecha
                                  {pendingSortField === 'date' ? (
                                      pendingSortOrder === 'asc' ? <ArrowUp size={13} className="text-teal-600 font-bold" /> : <ArrowDown size={13} className="text-teal-600 font-bold" />
                                  ) : (
                                      <ArrowUpDown size={13} className="text-slate-300 hover:text-slate-400" />
                                  )}
                              </div>
                          </th>
                          <th 
                              className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                              onClick={() => handlePendingSort('patientName')}
                          >
                              <div className="flex items-center gap-1.5">
                                  Paciente
                                  {pendingSortField === 'patientName' ? (
                                      pendingSortOrder === 'asc' ? <ArrowUp size={13} className="text-teal-600 font-bold" /> : <ArrowDown size={13} className="text-teal-600 font-bold" />
                                  ) : (
                                      <ArrowUpDown size={13} className="text-slate-300 hover:text-slate-400" />
                                  )}
                              </div>
                          </th>
                          <th 
                              className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                              onClick={() => handlePendingSort('insurance')}
                          >
                              <div className="flex items-center gap-1.5">
                                  Obra Social
                                  {pendingSortField === 'insurance' ? (
                                      pendingSortOrder === 'asc' ? <ArrowUp size={13} className="text-teal-600 font-bold" /> : <ArrowDown size={13} className="text-teal-600 font-bold" />
                                  ) : (
                                      <ArrowUpDown size={13} className="text-slate-300 hover:text-slate-400" />
                                  )}
                              </div>
                          </th>
                          <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase text-center select-none">Estado</th>
                          <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase text-center select-none">Acciones</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredAndSortedPendingConsultations.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-3 text-sm text-slate-600">{formatDate(c.date)}</td>
                              <td className="px-6 py-3 text-sm font-medium text-slate-800">{c.patientName}</td>
                              <td className="px-6 py-3 text-sm text-slate-600">{c.insurance}</td>
                              <td className="px-6 py-3 text-center">
                                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Pendiente</span>
                              </td>
                              <td className="px-6 py-3 text-center">
                                  <button
                                      onClick={() => openManualMatchModal(c)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-teal-750 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg transition-all shadow-sm hover:scale-102 cursor-pointer"
                                      title="Conciliar manualmente este paciente con una liquidación pendiente"
                                  >
                                      <Search size={13} />
                                      Conciliar a mano
                                  </button>
                              </td>
                          </tr>
                      ))}
                      {filteredAndSortedPendingConsultations.length === 0 && (
                          <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400">
                                  {pendingSearch ? (
                                      <div>
                                          <p className="font-medium text-slate-600">No se encontraron pacientes pendientes para "{pendingSearch}"</p>
                                          <p className="text-xs text-slate-400 mt-1">Pruebe borrando el filtro o buscando otros términos.</p>
                                      </div>
                                  ) : (
                                      "Todo conciliado. ¡Excelente trabajo!"
                                  )}
                              </td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* MANUAL RECONCILIATION MODAL */}
      {selectedConsultation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden transform transition-all duration-200">
            {/* Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-teal-600 uppercase tracking-widest block mb-1">Coincidencia Manual</span>
                <h3 className="text-xl font-bold text-slate-800">Conciliación Manual de Paciente</h3>
              </div>
              <button 
                onClick={() => setSelectedConsultation(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Target Patient Card */}
            <div className="p-6 bg-teal-50/50 border-b border-teal-100/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-teal-750/80 uppercase">Paciente Pendiente (Consulta)</p>
                  <p className="text-base font-bold text-teal-900 mt-0.5">{selectedConsultation.patientName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-teal-750/80 uppercase">Obra Social asignada</p>
                  <p className="text-base font-medium text-teal-900 mt-0.5">{selectedConsultation.insurance}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-teal-750/80 uppercase">Fecha de Consulta realizada</p>
                  <p className="text-sm font-medium text-teal-900 mt-0.5">
                    {formatDate(selectedConsultation.date)}
                  </p>
                </div>
              </div>
            </div>

            {/* Search Input Bar */}
            <div className="p-6 border-b border-slate-100 bg-white">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Buscar en liquidaciones pendientes</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 placeholder-slate-400 transition-all font-medium"
                  placeholder="Buscar por apellido, nombre u obra social en liquidaciones..."
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title="Limpiar búsqueda"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                <Info size={12} /> Se completó con el presunto apellido. Puede editarlo para acotar o ampliar la búsqueda en liquidaciones.
              </p>
            </div>

            {/* Candidate List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 max-h-[40vh]">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Resultados en Liquidaciones (Ordenados por Coincidencia)</h4>
              
              {candidateLiquidations.length > 0 ? (
                candidateLiquidations.map((liq: any) => {
                  return (
                    <div 
                      key={liq.id}
                      className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-teal-200 hover:shadow-md transition-all group animate-in fade-in duration-150"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800 text-sm group-hover:text-teal-900 transition-colors uppercase">
                            {liq.patientName}
                          </p>
                          {liq.score >= 100 ? (
                            <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full uppercase">Coincidencia Exacta</span>
                          ) : liq.score >= 50 ? (
                            <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5">Sugerido ({Math.round(liq.score)}%)</span>
                          ) : (
                            <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase">Coincidencia Parcial</span>
                          )}
                        </div>
                        
                        <div className="flex gap-4 text-xs text-slate-500">
                          <span className={`${liq.insuranceMatch ? 'text-emerald-600 font-semibold md:bg-emerald-50 px-1.5 py-0.5 rounded' : 'text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded'}`}>
                            Obra Social: {liq.insurance}
                          </span>
                          <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            <Calendar size={12} /> Práctica: {formatDate(liq.datePerformed)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 justify-between md:justify-end">
                        <div className="text-right">
                          <p className="text-slate-400 text-[10px] font-semibold uppercase">Monto Neto</p>
                          <p className="font-bold text-slate-800 text-base font-mono">${liq.netAmount.toLocaleString()}</p>
                        </div>
                        
                        <button
                          onClick={() => handlePerformManualReconciliation(liq.id)}
                          className="flex items-center gap-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer hover:shadow"
                        >
                          <Check size={14} />
                          Conciliar
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 bg-white border border-slate-150 rounded-xl p-6 text-slate-400">
                  <p className="font-medium text-slate-600">No se encontraron liquidaciones pendientes para "{searchQuery}"</p>
                  <p className="text-xs text-slate-400 mt-1">Pruebe borrando el filtro o buscando otros términos del paciente.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedConsultation(null)}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-xs font-bold transition-all border border-slate-200 bg-white shadow-sm"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};