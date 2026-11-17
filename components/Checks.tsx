import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  CheckCircle, Clock, AlertTriangle, Search, X, CheckSquare, Sparkles, Filter, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, Check, Info, FileSpreadsheet
} from 'lucide-react';
import { normalizeText, formatDate } from '../utils/excelParser';
import { Consultation, Liquidation } from '../types';

export const Checks: React.FC = () => {
  const { 
    selectedDoctorId, doctors, consultations, liquidations, manualReconciliationSolo 
  } = useApp();

  const currentDoctor = useMemo(() => 
    doctors.find(d => d.id === selectedDoctorId), 
  [doctors, selectedDoctorId]);

  const docConsultations = useMemo(() => 
    consultations.filter(c => c.doctorId === selectedDoctorId), 
  [consultations, selectedDoctorId]);

  const docLiquidations = useMemo(() => 
    liquidations.filter(l => l.doctorId === selectedDoctorId), 
  [liquidations, selectedDoctorId]);

  // States for search, range filters, and statuses
  const [searchTerm, setSearchTerm] = useState('');
  const [coincidenceRange, setCoincidenceRange] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showStatus, setShowStatus] = useState<'pending' | 'reconciled' | 'all'>('pending');

  // Sorting states
  const [sortField, setSortField] = useState<'date' | 'patient' | 'score'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Helper score calculation between a consultation and a liquidation
  const calculateMatchScore = (c: Consultation, l: Liquidation): { score: number; reasons: string[] } => {
    const cName = normalizeText(c.patientName);
    const lName = normalizeText(l.patientName);
    
    if (!cName || !lName) return { score: 0, reasons: ['Sin datos'] };

    let score = 0;
    const reasons: string[] = [];

    // Exact Patient Name Match
    if (cName === lName) {
      score += 70;
      reasons.push('Nombre idéntico');
    } else {
      // Word overlapping in name
      const cWords = cName.split(/\s+/).filter(w => w.length >= 2);
      const lWords = lName.split(/\s+/).filter(w => w.length >= 2);
      
      let overlapCount = 0;
      cWords.forEach(cw => {
        if (lWords.some(lw => lw.includes(cw) || cw.includes(lw))) {
          overlapCount++;
        }
      });

      if (overlapCount > 0) {
        const maxWords = Math.max(cWords.length, lWords.length);
        const overlapPercent = overlapCount / maxWords;
        const partialScore = Math.round(overlapPercent * 60);
        score += partialScore;
        reasons.push(`Nombre parcial (${Math.round(overlapPercent * 100)}%)`);
      }
    }

    // Insurance Match
    const cIns = normalizeText(c.insurance);
    const lIns = normalizeText(l.insurance);
    if (cIns && lIns && (cIns.includes(lIns) || lIns.includes(cIns))) {
      score += 30;
      reasons.push('Obra social coincide');
    }

    // Date proximity (optional boost)
    const cDate = new Date(c.date);
    const lDate = new Date(l.datePerformed);
    const diffTime = Math.abs(cDate.getTime() - lDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 4) {
      score += 10;
      reasons.push('Fechas coincidentes');
    } else if (diffDays <= 15) {
      score += 5;
      reasons.push('Fechas próximas');
    }

    score = Math.min(100, score);
    return { score, reasons };
  };

  // Compute matches for ALL consultations of this doctor
  const allMatches = useMemo(() => {
    // Separate matched and unmatched liquidations
    const unmatchedLiqs = docLiquidations.filter(l => !l.isMatched);

    return docConsultations.map(c => {
      // If consultation is already reconciled, it is linked to a liquidation
      if (c.isReconciled && c.liquidationId) {
        const matchedLiq = docLiquidations.find(l => l.id === c.liquidationId);
        if (matchedLiq) {
          const matchResult = calculateMatchScore(c, matchedLiq);
          return {
            consultation: c,
            isReconciled: true,
            bestCandidate: {
              liquidation: matchedLiq,
              score: Math.max(85, matchResult.score), // Assured high score if linked
              reasons: ['Ya conciliados']
            }
          };
        }
      }

      // Find the best candidates amongst all unmatched liquidations
      const candidates = unmatchedLiqs.map(l => {
        const { score, reasons } = calculateMatchScore(c, l);
        return { liquidation: l, score, reasons };
      }).sort((a, b) => b.score - a.score);

      const best = candidates[0];
      return {
        consultation: c,
        isReconciled: false,
        bestCandidate: best && best.score >= 10 ? best : null
      };
    });
  }, [docConsultations, docLiquidations]);

  // Handle manual reconciliation toggle (checkbox "check a mano")
  const handleCheckboxToggle = (consultationId: string, currentChecked: boolean, liquidationId?: string) => {
    // If checking (reconciling) and there is a liquidationId, we bind them.
    // Otherwise, we toggle the reconciliation state directly.
    manualReconciliationSolo(consultationId, !currentChecked, !currentChecked ? liquidationId : undefined);
  };

  // Statistics for filters
  const counts = useMemo(() => {
    let pendingCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    allMatches.forEach(item => {
      if (!item.consultation.isReconciled) {
        pendingCount++;
        const score = item.bestCandidate ? item.bestCandidate.score : 0;
        if (score >= 80) highCount++;
        else if (score >= 40) mediumCount++;
        else lowCount++;
      }
    });

    return {
      pending: pendingCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      reconciled: allMatches.filter(item => item.consultation.isReconciled).length
    };
  }, [allMatches]);

  // Filter and sort consultations
  const processedItems = useMemo(() => {
    // 1. Status Filter (Pending vs Reconciled vs All)
    let filtered = allMatches.filter(item => {
      if (showStatus === 'pending') return !item.consultation.isReconciled;
      if (showStatus === 'reconciled') return item.consultation.isReconciled;
      return true;
    });

    // 2. Coincidence Range Filter (Only applies to Pending or All list)
    filtered = filtered.filter(item => {
      if (coincidenceRange === 'all') return true;
      const score = item.bestCandidate ? item.bestCandidate.score : 0;
      if (coincidenceRange === 'high') return score >= 80;
      if (coincidenceRange === 'medium') return score >= 40 && score < 80;
      if (coincidenceRange === 'low') return score < 40;
      return true;
    });

    // 3. Search text Filter
    const query = searchTerm.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(item => 
        normalizeText(item.consultation.patientName).includes(query) ||
        normalizeText(item.consultation.insurance).includes(query) ||
        (item.bestCandidate && normalizeText(item.bestCandidate.liquidation.patientName).includes(query))
      );
    }

    // 4. Sort
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.consultation.date).getTime() - new Date(b.consultation.date).getTime();
      } else if (sortField === 'patient') {
        comparison = a.consultation.patientName.localeCompare(b.consultation.patientName);
      } else if (sortField === 'score') {
        const scoreA = a.bestCandidate ? a.bestCandidate.score : 0;
        const scoreB = b.bestCandidate ? b.bestCandidate.score : 0;
        comparison = scoreA - scoreB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [allMatches, showStatus, coincidenceRange, searchTerm, sortField, sortOrder]);

  const handleSort = (field: 'date' | 'patient' | 'score') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'score' ? 'desc' : 'asc');
    }
  };

  if (!selectedDoctorId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 p-8">
        <div className="text-center">
          <CheckSquare size={48} className="mx-auto text-slate-300 mb-4 animate-bounce" />
          <p className="text-xl font-medium text-slate-600">Seleccione un médico para ver la pestaña Checks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8" id="checks-tab-container">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            <CheckSquare className="text-teal-600" />
            Checks Pre-Conciliación
          </h2>
          <p className="text-slate-500 mt-1">
            Vista rápida para tildar consultas y liquidaciones pendientes según coincidencia inteligente para <span className="font-semibold text-teal-600">{currentDoctor?.firstName} {currentDoctor?.lastName}</span>
          </p>
        </div>
      </div>

      {/* KPI & Intelligent Filter Ranges */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="checks-kpi-grid">
        {/* Total Pending Selector */}
        <button 
          onClick={() => { setCoincidenceRange('all'); setShowStatus('pending'); }}
          className={`text-left p-5 rounded-xl border transition-all relative ${
            coincidenceRange === 'all' && showStatus === 'pending'
              ? 'bg-white border-teal-500 ring-2 ring-teal-500/10 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pendientes</p>
            <Clock size={18} className="text-slate-400" />
          </div>
          <h4 className="text-2xl font-bold text-slate-800 mt-2">{counts.pending}</h4>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Consultas por liquidar</p>
          {coincidenceRange === 'all' && showStatus === 'pending' && (
            <div className="absolute right-3 bottom-3 w-1.5 h-1.5 rounded-full bg-teal-500" />
          )}
        </button>

        {/* High Coincidence Selector */}
        <button 
          onClick={() => { setCoincidenceRange('high'); setShowStatus('pending'); }}
          className={`text-left p-5 rounded-xl border transition-all relative ${
            coincidenceRange === 'high' && showStatus === 'pending'
              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/10 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Coincidencia Alta</p>
            <Sparkles size={18} className="text-emerald-500 animate-pulse" />
          </div>
          <h4 className="text-2xl font-bold text-emerald-800 mt-2">{counts.high}</h4>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Mayor o igual al 80%</p>
          {coincidenceRange === 'high' && showStatus === 'pending' && (
            <div className="absolute right-3 bottom-3 w-1.5 h-1.5 rounded-full bg-emerald-500" />
          )}
        </button>

        {/* Medium Coincidence Selector */}
        <button 
          onClick={() => { setCoincidenceRange('medium'); setShowStatus('pending'); }}
          className={`text-left p-5 rounded-xl border transition-all relative ${
            coincidenceRange === 'medium' && showStatus === 'pending'
              ? 'bg-white border-amber-500 ring-2 ring-amber-500/10 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Coincidencia Media</p>
            <Info size={18} className="text-amber-500" />
          </div>
          <h4 className="text-2xl font-bold text-amber-800 mt-2">{counts.medium}</h4>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Entre 40% y 79%</p>
          {coincidenceRange === 'medium' && showStatus === 'pending' && (
            <div className="absolute right-3 bottom-3 w-1.5 h-1.5 rounded-full bg-amber-500" />
          )}
        </button>

        {/* Low/No Coincidence Selector */}
        <button 
          onClick={() => { setCoincidenceRange('low'); setShowStatus('pending'); }}
          className={`text-left p-5 rounded-xl border transition-all relative ${
            coincidenceRange === 'low' && showStatus === 'pending'
              ? 'bg-white border-slate-400 ring-2 ring-slate-400/10 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Baja / Ninguna</p>
            <AlertTriangle size={18} className="text-slate-400" />
          </div>
          <h4 className="text-2xl font-bold text-slate-700 mt-2">{counts.low}</h4>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Menor al 40%</p>
          {coincidenceRange === 'low' && showStatus === 'pending' && (
            <div className="absolute right-3 bottom-3 w-1.5 h-1.5 rounded-full bg-slate-500" />
          )}
        </button>
      </div>

      {/* Main Filter Toolbar & Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" id="checks-workspace">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50/50">
          
          {/* Status Tab Toggle & Text Search */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Show Status Filter Pillbox */}
            <div className="inline-flex bg-slate-200/60 p-1 rounded-xl">
              <button
                onClick={() => { setShowStatus('pending'); }}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  showStatus === 'pending' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Pendientes ({counts.pending})
              </button>
              <button
                onClick={() => { setShowStatus('reconciled'); setCoincidenceRange('all'); }}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  showStatus === 'reconciled' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Conciliados ({counts.reconciled})
              </button>
              <button
                onClick={() => { setShowStatus('all'); setCoincidenceRange('all'); }}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  showStatus === 'all' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Todos ({allMatches.length})
              </button>
            </div>

            {/* Range Pills (visible only when not looking at 'reconciled') */}
            {showStatus !== 'reconciled' && (
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                <Filter size={12} className="text-slate-500" />
                <span className="text-[11px] font-bold text-slate-500 mr-1">Coincidencia:</span>
                <button 
                  onClick={() => setCoincidenceRange('all')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                    coincidenceRange === 'all' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas
                </button>
                <button 
                  onClick={() => setCoincidenceRange('high')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                    coincidenceRange === 'high' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Alta (≥80%)
                </button>
                <button 
                  onClick={() => setCoincidenceRange('medium')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                    coincidenceRange === 'medium' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Media (40-79%)
                </button>
                <button 
                  onClick={() => setCoincidenceRange('low')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                    coincidenceRange === 'low' ? 'bg-slate-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Baja (&lt;40%)
                </button>
              </div>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por paciente u obra social..."
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder-slate-400 font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table layout */}
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left border-collapse" id="checks-matching-table">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase select-none w-16 text-center">
                  ¿Conciliar?
                </th>
                <th 
                  className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1.5">
                    Fecha Consulta
                    {sortField === 'date' ? (
                      sortOrder === 'asc' ? <ArrowUp size={13} className="text-teal-600 font-bold" /> : <ArrowDown size={13} className="text-teal-600 font-bold" />
                    ) : (
                      <ArrowUpDown size={13} className="text-slate-300" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  onClick={() => handleSort('patient')}
                >
                  <div className="flex items-center gap-1.5">
                    Paciente Consulta
                    {sortField === 'patient' ? (
                      sortOrder === 'asc' ? <ArrowUp size={13} className="text-teal-600 font-bold" /> : <ArrowDown size={13} className="text-teal-600 font-bold" />
                    ) : (
                      <ArrowUpDown size={13} className="text-slate-300" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase select-none">
                  Obra Social
                </th>
                <th 
                  className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  onClick={() => handleSort('score')}
                >
                  <div className="flex items-center gap-1.5">
                    Porcentaje Coincidencia
                    {sortField === 'score' ? (
                      sortOrder === 'asc' ? <ArrowUp size={13} className="text-teal-600 font-bold" /> : <ArrowDown size={13} className="text-teal-600 font-bold" />
                    ) : (
                      <ArrowUpDown size={13} className="text-slate-300" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase select-none">
                  Liquidación Más Cercana Sugerida
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {processedItems.map(({ consultation, bestCandidate }) => {
                const isReconciled = consultation.isReconciled;
                const score = bestCandidate ? bestCandidate.score : 0;
                
                // Set score pill color classes
                let scoreBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                let scoreProgressColor = 'bg-slate-400';
                if (isReconciled) {
                  scoreBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  scoreProgressColor = 'bg-emerald-500';
                } else if (score >= 80) {
                  scoreBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  scoreProgressColor = 'bg-emerald-500';
                } else if (score >= 40) {
                  scoreBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                  scoreProgressColor = 'bg-amber-500';
                } else if (score > 0) {
                  scoreBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                  scoreProgressColor = 'bg-rose-400';
                }

                return (
                  <tr 
                    key={consultation.id} 
                    className={`transition-colors hover:bg-slate-50/40 ${
                      isReconciled ? 'bg-emerald-50/20' : ''
                    }`}
                  >
                    {/* Checkbox Trigger column */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <label className="relative flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="checkbox"
                            checked={isReconciled}
                            onChange={() => handleCheckboxToggle(
                              consultation.id, 
                              isReconciled, 
                              bestCandidate?.liquidation.id
                            )}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white transition-all checked:border-emerald-500 checked:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <span className="absolute text-white opacity-0 transition-opacity pointer-events-none peer-checked:opacity-100">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        </label>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                      {formatDate(consultation.date)}
                    </td>

                    {/* Consultation Patient */}
                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                      {consultation.patientName}
                    </td>

                    {/* Consultation Insurance */}
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-flex px-2 py-0.5 text-xs font-bold bg-cyan-50 border border-cyan-100 text-cyan-700 rounded-md">
                        {consultation.insurance}
                      </span>
                    </td>

                    {/* Coincidence percentage bar & badge */}
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-col gap-1.5 max-w-[180px]">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${scoreBadgeClass}`}>
                            {isReconciled ? 'Conciliado' : `${score}% Coincid.`}
                          </span>
                          {!isReconciled && score > 0 && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              Sugerido
                            </span>
                          )}
                        </div>
                        {score > 0 && (
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div 
                              className={`h-1.5 rounded-full transition-all duration-500 ${scoreProgressColor}`}
                              style={{ width: `${isReconciled ? 100 : score}%` }}
                            />
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {isReconciled 
                            ? 'Fijado por el usuario' 
                            : bestCandidate 
                              ? bestCandidate.reasons.join(', ')
                              : 'Sin candidato idóneo'
                          }
                        </p>
                      </div>
                    </td>

                    {/* Best Match Candidate Details */}
                    <td className="px-6 py-4 text-sm">
                      {bestCandidate ? (
                        <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-100 max-w-sm space-y-1">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-xs text-slate-800 truncate block max-w-[180px]">
                              {bestCandidate.liquidation.patientName}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                              ${bestCandidate.liquidation.netAmount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>OS: {bestCandidate.liquidation.insurance}</span>
                            <span>Prác: {formatDate(bestCandidate.liquidation.datePerformed)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic">
                          No se encontró ninguna liquidación disponible para emparejar
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {processedItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-2">
                      <HelpCircle size={32} className="mx-auto text-slate-300" />
                      <p className="font-semibold text-slate-600">No hay consultas para mostrar</p>
                      <p className="text-xs text-slate-400">
                        {searchTerm 
                          ? `No se encontraron coincidencias para "${searchTerm}" en este filtro.`
                          : 'Todo al día. No existen consultas pendientes bajo este criterio de búsqueda.'
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
