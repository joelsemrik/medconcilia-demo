import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { FileUp, CheckCircle, AlertCircle, Search, Trash2, Cloud, LogOut, Clock, RefreshCw, X } from 'lucide-react';
import { parseConsultationFile, parseLiquidationFile, normalizeText, formatDate } from '../utils/excelParser';
import { listDriveSpreadsheets, downloadDriveFile, DriveFile } from '../utils/googleAuth';

interface DataUploadProps {
  type: 'consultations' | 'liquidations';
}

export const DataUpload: React.FC<DataUploadProps> = ({ type }) => {
  const { 
    selectedDoctorId, 
    doctors, 
    consultations, 
    liquidations, 
    addConsultations, 
    addLiquidations, 
    clearDoctorData,
    deleteConsultation,
    deleteLiquidation,
    deleteParticularLiquidations,
    user,
    googleToken,
    signInWithGoogle,
    signOutFromGoogle,
    isGoogleLoading
  } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Google Drive Integration State
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState('');
  const [importingFileId, setImportingFileId] = useState<string | null>(null);

  // Confirmation state for deleting items (replaces iframe-blocked native confirms)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: 'all' | 'particular' | string; name: string } | null>(null);

  const currentDoctor = doctors.find(d => d.id === selectedDoctorId);
  
  // Filter data for the current view
  const data = type === 'consultations' 
    ? consultations.filter(c => c.doctorId === selectedDoctorId)
    : liquidations.filter(l => l.doctorId === selectedDoctorId);

  const particularCount = type === 'liquidations'
    ? data.filter(l => normalizeText(l.insurance) === normalizeText('Particular')).length
    : 0;

  // Filtered list for display
  const filteredData = data.filter((item: any) => {
      const searchStr = filter.toLowerCase();
      return item.patientName.toLowerCase().includes(searchStr) || item.insurance.toLowerCase().includes(searchStr);
  });

  // Load files from Google Drive
  const loadDriveFiles = async () => {
    if (!googleToken) return;
    setDriveLoading(true);
    setDriveError(null);
    try {
      const files = await listDriveSpreadsheets();
      setDriveFiles(files);
    } catch (err: any) {
      console.error(err);
      setDriveError("Error al listar archivos de Google Drive. Intente de nuevo.");
    } finally {
      setDriveLoading(false);
    }
  };

  // Trigger loading when modal is shown and we have a token
  useEffect(() => {
    if (showDriveModal && googleToken) {
      loadDriveFiles();
    }
  }, [showDriveModal, googleToken]);

  const handleImportFromDrive = async (fileId: string, fileName: string, mimeType: string) => {
    if (!selectedDoctorId) {
      setDriveError("Por favor seleccione un médico primero.");
      return;
    }
    setImportingFileId(fileId);
    setDriveError(null);
    try {
      const arrayBuffer = await downloadDriveFile(fileId, mimeType);
      const blob = new Blob([arrayBuffer]);
      const file = blob as File; // Cast is safe as Excel reader uses readAsBinaryString which works on Blobs

      if (type === 'consultations') {
        const result = await parseConsultationFile(file, selectedDoctorId);
        addConsultations(result);
      } else {
        const result = await parseLiquidationFile(file, selectedDoctorId);
        addLiquidations(result);
      }

      setShowDriveModal(false);
    } catch (err: any) {
      console.error(err);
      setDriveError(`Error al importar: ${err.message || "Asegúrese de que el archivo tenga un formato compatible"}`);
    } finally {
      setImportingFileId(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    if (!selectedDoctorId) {
        setError("Por favor seleccione un médico primero.");
        return;
    }

    setLoading(true);
    setError(null);
    const file = e.target.files[0];

    try {
      if (type === 'consultations' && file.name.toLowerCase().endsWith('.pdf')) {
        // PDF parser via server-side Gemini API
        const base64 = await fileToBase64(file);
        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileBase64: base64 }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Error al procesar el archivo PDF');
        }

        const parsedRows = await response.json(); // Array of { date, patientName, insurance }
        
        const consultations = parsedRows.map((row: any, index: number) => {
          let parsedDate = new Date().toISOString();
          if (row.date) {
            const d = new Date(row.date);
            if (!isNaN(d.getTime())) {
              parsedDate = d.toISOString();
            }
          }
          return {
            id: `cons-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
            doctorId: selectedDoctorId,
            date: parsedDate,
            patientName: row.patientName || 'Paciente Desconocido',
            insurance: row.insurance || 'Particular',
            isReconciled: false,
          };
        });

        addConsultations(consultations);
      } else {
        // Standard Excel File Flow
        if (type === 'consultations') {
          const result = await parseConsultationFile(file, selectedDoctorId);
          addConsultations(result);
        } else {
          const result = await parseLiquidationFile(file, selectedDoctorId);
          addLiquidations(result);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al procesar el archivo. Asegúrese de que tenga un formato compatible.");
    } finally {
      setLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleClear = () => {
    if (!selectedDoctorId) return;
    const itemType = type === 'consultations' ? 'consultas' : 'liquidaciones';
    setDeleteConfirm({ id: 'all', name: `TODOS los registros de ${itemType}` });
  };

  const handleDeleteParticulars = () => {
    if (!selectedDoctorId) return;
    setDeleteConfirm({ id: 'particular', name: 'todos los registros de Obra Social "Particular"' });
  };

  const handleDeleteItem = (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    
    if (id === 'all') {
      if (selectedDoctorId) {
        clearDoctorData(type, selectedDoctorId);
      }
    } else if (id === 'particular') {
      if (selectedDoctorId) {
        deleteParticularLiquidations(selectedDoctorId);
      }
    } else {
      if (type === 'consultations') {
        deleteConsultation(id);
      } else {
        deleteLiquidation(id);
      }
    }
    setDeleteConfirm(null);
  };

  if (!selectedDoctorId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-12">
        <AlertCircle size={48} className="mb-4 text-slate-300" />
        <p className="text-xl">Selecciona un médico en la pestaña "Médicos" para continuar.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-screen flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 capitalize">
            {type === 'consultations' ? 'Carga de Pacientes (Consultas)' : 'Carga de Liquidaciones'}
          </h2>
          <p className="text-slate-500 mt-1">
            Médico Activo: <span className="font-semibold text-teal-600">{currentDoctor?.firstName} {currentDoctor?.lastName}</span>
          </p>
        </div>
        
        <div className="flex gap-3">
            {type === 'liquidations' && particularCount > 0 && (
                <button 
                    onClick={handleDeleteParticulars}
                    className="flex items-center gap-2 px-5 py-3 rounded-lg shadow-sm bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-all font-medium"
                    title='Eliminar todas las liquidaciones con obra social "Particular"'
                >
                    <Trash2 size={20} />
                    Eliminar Particulares ({particularCount})
                </button>
            )}

            {data.length > 0 && (
                <button 
                    onClick={handleClear}
                    className="flex items-center gap-2 px-5 py-3 rounded-lg shadow-sm bg-white text-red-600 hover:bg-red-50 hover:border-red-200 border border-slate-200 transition-all font-medium"
                >
                    <Trash2 size={20} />
                    Limpiar Datos
                </button>
            )}

            <button 
                onClick={() => setShowDriveModal(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-lg shadow-md bg-sky-600 hover:bg-sky-700 text-white transition-all hover:scale-105 font-medium"
            >
                <Cloud size={20} />
                Importar de Drive
            </button>

            <label className={`flex items-center gap-2 px-5 py-3 rounded-lg shadow-md cursor-pointer transition-transform hover:scale-105 ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <FileUp size={20} />}
                <span className="font-medium">{loading ? 'Procesando...' : (type === 'consultations' ? 'Subir Excel / PDF' : 'Subir Excel (.xlsx)')}</span>
                <input 
                    type="file" 
                    accept={type === 'consultations' ? ".xlsx, .xls, .pdf" : ".xlsx, .xls"} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                    disabled={loading}
                />
            </label>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            {error}
        </div>
      )}

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="font-semibold text-slate-700">Registros ({filteredData.length})</h3>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Buscar paciente..." 
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
            </div>
        </div>
        
        <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase border-b">Fecha</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase border-b">Paciente</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase border-b">Obra Social</th>
                        {type === 'liquidations' && (
                             <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase border-b text-right">Monto Neto</th>
                        )}
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase border-b text-center">Estado</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase border-b text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredData.length > 0 ? (
                        filteredData.map((item: any) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3 text-sm text-slate-600">
                                    {formatDate(type === 'consultations' ? item.date : item.datePerformed)}
                                </td>
                                <td className="px-6 py-3 text-sm font-medium text-slate-800">{item.patientName}</td>
                                <td className="px-6 py-3 text-sm text-slate-600">
                                    <span className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded-md text-xs font-medium border border-cyan-100">
                                        {item.insurance}
                                    </span>
                                </td>
                                {type === 'liquidations' && (
                                    <td className="px-6 py-3 text-sm text-slate-800 text-right font-mono">
                                        ${item.netAmount.toFixed(2)}
                                    </td>
                                )}
                                <td className="px-6 py-3 text-center">
                                    {(type === 'consultations' ? item.isReconciled : item.isMatched) ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                            <CheckCircle size={12} /> Conciliado
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                            Pendiente
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-3 text-center">
                                    <button
                                        onClick={() => handleDeleteItem(item.id, item.patientName)}
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex justify-center items-center"
                                        title="Eliminar registro"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={type === 'liquidations' ? 6 : 5} className="px-6 py-12 text-center text-slate-400">
                                No hay datos cargados para este criterio.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* GOOGLE DRIVE SELECTOR MODAL */}
      {showDriveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="google-drive-modal">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden transform transition-all">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                  <Cloud size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Importar desde Google Drive</h3>
                  <p className="text-slate-500 text-xs">Busca y selecciona planillas Excel directamente desde la nube</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDriveModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                id="close-drive-modal-btn"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-auto flex flex-col min-h-[350px]">
              
              {isGoogleLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 py-12">
                  <RefreshCw className="animate-spin text-sky-600" size={32} />
                  <p className="text-sm">Verificando estado de Google...</p>
                </div>
              ) : !googleToken ? (
                /* LOGIN SCREEN */
                <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-8">
                  <div className="w-16 h-16 bg-gradient-to-tr from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-100 mb-6 font-bold text-2xl">
                    MD
                  </div>
                  <h4 className="text-xl font-bold text-slate-800 mb-2">Conectarse con Google Drive</h4>
                  <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                    Para importar tus archivos de consultas y liquidaciones, necesitas conectar la aplicación con tu cuenta de Google. Accederemos con permisos de lectura.
                  </p>

                  <button 
                    onClick={signInWithGoogle}
                    className="flex items-center justify-center gap-3 px-6 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95 text-sm"
                    id="gsi-drive-login-btn"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    <span>Iniciar sesión con Google</span>
                  </button>
                </div>
              ) : (
                /* LOGGED IN FILE SELECTOR */
                <div className="flex-1 flex flex-col gap-4">
                  
                  {/* User info banner */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm">
                    <div className="flex items-center gap-2.5">
                      {user?.photoURL ? (
                        <img referrerPolicy="no-referrer" src={user.photoURL} alt={user.displayName || "Avatar"} className="w-8 h-8 rounded-full shadow-sm" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-xs">
                          {user?.displayName ? user.displayName[0] : 'U'}
                        </div>
                      )}
                      <div className="text-xs">
                        <p className="font-semibold text-slate-700">{user?.displayName}</p>
                        <p className="text-slate-400">{user?.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={signOutFromGoogle}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1 text-xs font-semibold"
                      title="Cerrar sesión"
                      id="gsi-logout-modal-btn"
                    >
                      <LogOut size={14} />
                      Desconectar
                    </button>
                  </div>

                  {/* Search and reload row */}
                  <div className="flex gap-2.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="text" 
                        placeholder="Filtrar archivos en Drive..." 
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                        value={driveSearch}
                        onChange={(e) => setDriveSearch(e.target.value)}
                      />
                    </div>
                    <button 
                      onClick={loadDriveFiles}
                      disabled={driveLoading}
                      className="p-2 border border-slate-200 hover:bg-slate-50 disabled:bg-slate-100 rounded-xl transition-all"
                      title="Actualizar lista"
                      id="drive-refresh-btn"
                    >
                      <RefreshCw size={16} className={`${driveLoading ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
                    </button>
                  </div>

                  {driveError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={16} />
                        <span>{driveError}</span>
                      </div>
                      <button onClick={loadDriveFiles} className="font-semibold underline hover:text-red-800 bg-transparent shrink-0">Reintentar</button>
                    </div>
                  )}

                  {/* Drive Files List */}
                  <div className="border border-slate-100 rounded-xl flex-1 min-h-[220px] max-h-[300px] overflow-auto bg-slate-50/50">
                    {driveLoading ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 p-12">
                        <RefreshCw className="animate-spin text-sky-500" size={24} />
                        <span className="text-xs">Cargando tus planillas...</span>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {driveFiles.filter(f => f.name.toLowerCase().includes(driveSearch.toLowerCase())).length > 0 ? (
                          driveFiles
                            .filter(f => f.name.toLowerCase().includes(driveSearch.toLowerCase()))
                            .map((file) => (
                              <div key={file.id} className="p-3.5 flex items-center justify-between hover:bg-white transition-all bg-white/70">
                                <div className="flex items-center gap-3 min-w-0 pr-4">
                                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                                    <FileUp size={18} />
                                  </div>
                                  <div className="min-w-0 text-left">
                                    <p className="font-medium text-slate-800 text-sm truncate" title={file.name}>{file.name}</p>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                      <Clock size={10} />
                                      Modificado el {formatDate(file.modifiedTime)} {new Date(file.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleImportFromDrive(file.id, file.name, file.mimeType)}
                                  disabled={importingFileId !== null}
                                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-lg text-xs shadow-sm shadow-emerald-50 hover:shadow-md transition-all shrink-0 flex items-center gap-1"
                                >
                                  {importingFileId === file.id ? (
                                    <RefreshCw className="animate-spin w-3 h-3" />
                                  ) : null}
                                  {importingFileId === file.id ? 'Importando...' : 'Importar'}
                                </button>
                              </div>
                            ))
                        ) : (
                          <div className="py-12 px-6 text-center text-slate-400 text-xs">
                            {driveSearch ? 'No se encontraron archivos que coincidan con la búsqueda.' : 'No se encontraron planillas de cálculo (.xlsx, .xls, .csv) en tu Google Drive.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end text-[11px] text-slate-400 italic">
              Conexión cifrada a través de la API oficial de Google Workspace.
            </div>
            
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 p-6 transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-50 rounded-full">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">¿Confirmar eliminación?</h3>
            </div>
            
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              {deleteConfirm.id === 'all' ? (
                <span>
                  ¿Estás seguro de que deseas eliminar <strong>{deleteConfirm.name}</strong> para este médico? Esta acción no se puede deshacer.
                </span>
              ) : (
                <span>
                  ¿Estás seguro de que deseas eliminar {type === 'consultations' ? 'la consulta' : 'la liquidación'} del paciente <strong>"{deleteConfirm.name}"</strong>?
                </span>
              )}
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-red-100"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};