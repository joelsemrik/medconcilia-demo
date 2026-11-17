import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Download, FileSpreadsheet, FileText, CheckCircle, AlertTriangle, Clock, DollarSign, Printer, Cloud, RefreshCw, Mail } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { uploadFileToDrive } from '../utils/googleAuth';
import { exportToStyledExcel } from '../utils/excelExporter';
import { sendGmailMessage } from '../utils/gmailSender';
import { formatDate } from '../utils/excelParser';

export const Reports: React.FC = () => {
  const { 
    selectedDoctorId, 
    doctors, 
    consultations, 
    liquidations,
    user,
    googleToken,
    signInWithGoogle,
    isGoogleLoading
  } = useApp();
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [uploadingToDrive, setUploadingToDrive] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  
  const currentDoctor = doctors.find(d => d.id === selectedDoctorId);

  // Filter Data
  const docConsultations = useMemo(() => 
    consultations.filter(c => c.doctorId === selectedDoctorId), 
  [consultations, selectedDoctorId]);
  
  const docLiquidations = useMemo(() => 
    liquidations.filter(l => l.doctorId === selectedDoctorId), 
  [liquidations, selectedDoctorId]);

  // Combined Reconciliation Data
  const reconciliationData = useMemo(() => {
    return docConsultations.map(cons => {
        const matchedLiq = cons.liquidationId ? docLiquidations.find(l => l.id === cons.liquidationId) : null;
        return {
            fecha_consulta: formatDate(cons.date),
            paciente: cons.patientName,
            obra_social: cons.insurance,
            estado: cons.isReconciled ? 'Conciliado' : 'Pendiente',
            fecha_pago: matchedLiq ? formatDate(matchedLiq.importDate) : '-',
            monto_neto: matchedLiq ? matchedLiq.netAmount : 0,
            dias_demora: matchedLiq 
                ? Math.floor((new Date(matchedLiq.importDate).getTime() - new Date(cons.date).getTime()) / (1000 * 60 * 60 * 24)) 
                : '-'
        };
    });
  }, [docConsultations, docLiquidations]);

  // Stats for Charts (Duplicated logic from Dashboard for PDF generation view)
  const statsByInsurance = useMemo(() => {
    const stats: Record<string, { total: number, count: number, totalDelay: number, delayCount: number }> = {};
    docConsultations.forEach(cons => {
       if (cons.isReconciled && cons.liquidationId) {
           const liq = docLiquidations.find(l => l.id === cons.liquidationId);
           if (liq) {
               const insurance = cons.insurance.toUpperCase();
               if (!stats[insurance]) stats[insurance] = { total: 0, count: 0, totalDelay: 0, delayCount: 0 };
               stats[insurance].total += liq.netAmount;
               stats[insurance].count += 1;
               const days = Math.floor((new Date(liq.importDate).getTime() - new Date(cons.date).getTime()) / (1000 * 60 * 60 * 24));
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
    })).sort((a, b) => b.avgAmount - a.avgAmount);
  }, [docConsultations, docLiquidations]);

  const globalAvgDelayDays = statsByInsurance.length > 0
        ? statsByInsurance.reduce((acc, curr) => acc + (curr.avgDelayDays * curr.total), 0) / Math.max(statsByInsurance.reduce((acc, curr) => acc + curr.total, 0), 1)
        : 0;
  const globalAvgDelayMonths = (globalAvgDelayDays / 30).toFixed(1);

  const downloadExcel = (type: 'consultations' | 'liquidations' | 'reconciliation') => {
    let data: any[] = [];
    let title = '';
    let fileName = '';

    if (type === 'consultations') {
        data = docConsultations.map(c => ({
            Fecha: formatDate(c.date),
            Paciente: c.patientName,
            Obra_Social: c.insurance,
            Estado: c.isReconciled ? 'Conciliado' : 'Pendiente'
        }));
        title = 'Planilla Planificada de Consultas';
        fileName = `Consultas_${currentDoctor?.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    } else if (type === 'liquidations') {
        data = docLiquidations.map(l => ({
            Fecha_Realizado: formatDate(l.datePerformed),
            Fecha_Importacion: formatDate(l.importDate),
            Paciente: l.patientName,
            Obra_Social: l.insurance,
            Monto_Neto: l.netAmount,
            Estado: l.isMatched ? 'Conciliado' : 'Sin Asociar'
        }));
        title = 'Planilla Cargada de Liquidaciones';
        fileName = `Liquidaciones_${currentDoctor?.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    } else {
        data = reconciliationData;
        title = 'Reporte de Conciliación Completa y Auditoría';
        fileName = `Conciliacion_${currentDoctor?.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    }

    exportToStyledExcel({
        data,
        sheetName: type === 'reconciliation' ? 'Conciliación' : type === 'consultations' ? 'Consultas' : 'Liquidaciones',
        title,
        doctorName: currentDoctor ? `${currentDoctor.lastName}, ${currentDoctor.firstName}` : undefined,
        fileName
    });
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    setGeneratingPdf(true);
    
    try {
        const canvas = await html2canvas(reportRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Estadisticas_${currentDoctor?.lastName}.pdf`);
    } catch (e) {
        console.error("PDF Error", e);
        alert("Error al generar PDF");
    } finally {
        setGeneratingPdf(false);
    }
  };

  const saveExcelToDrive = async (type: 'consultations' | 'liquidations' | 'reconciliation') => {
    if (!googleToken) {
      if (confirm("Por favor conéctate a Google Drive primero. ¿Deseas iniciar sesión?")) {
        signInWithGoogle();
      }
      return;
    }

    setUploadingToDrive(type);
    try {
      let data: any[] = [];
      let title = '';
      let fileName = '';

      if (type === 'consultations') {
          data = docConsultations.map(c => ({
              Fecha: new Date(c.date).toLocaleDateString(),
              Paciente: c.patientName,
              Obra_Social: c.insurance,
              Estado: c.isReconciled ? 'Conciliado' : 'Pendiente'
          }));
          title = 'Planilla Planificada de Consultas';
          fileName = `Consultas_${currentDoctor?.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else if (type === 'liquidations') {
          data = docLiquidations.map(l => ({
              Fecha_Realizado: new Date(l.datePerformed).toLocaleDateString(),
              Fecha_Importacion: new Date(l.importDate).toLocaleDateString(),
              Paciente: l.patientName,
              Obra_Social: l.insurance,
              Monto_Neto: l.netAmount,
              Estado: l.isMatched ? 'Conciliado' : 'Sin Asociar'
          }));
          title = 'Planilla Cargada de Liquidaciones';
          fileName = `Liquidaciones_${currentDoctor?.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else {
          data = reconciliationData;
          title = 'Reporte de Conciliación Completa y Auditoría';
          fileName = `Conciliacion_${currentDoctor?.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      }

      const blob = exportToStyledExcel({
          data,
          sheetName: type === 'reconciliation' ? 'Conciliación' : type === 'consultations' ? 'Consultas' : 'Liquidaciones',
          title,
          doctorName: currentDoctor ? `${currentDoctor.lastName}, ${currentDoctor.firstName}` : undefined,
          fileName,
          returnBlob: true
      }) as Blob;

      await uploadFileToDrive(blob, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      alert(`¡Archivo "${fileName}" guardado en tu Google Drive correctamente!`);
    } catch (error: any) {
      console.error(error);
      alert(`Error al guardar en Google Drive: ${error.message || 'Verifica la conexión.'}`);
    } finally {
      setUploadingToDrive(null);
    }
  };

  const savePDFToDrive = async () => {
    if (!googleToken) {
      if (confirm("Por favor conéctate a Google Drive primero. ¿Deseas iniciar sesión?")) {
        signInWithGoogle();
      }
      return;
    }
    if (!reportRef.current) return;

    setUploadingToDrive('pdf');
    try {
        const canvas = await html2canvas(reportRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        const pdfBlob = pdf.output('blob');
        
        const fileName = `Estadisticas_${currentDoctor?.lastName}.pdf`;
        await uploadFileToDrive(pdfBlob, fileName, 'application/pdf');
        
        alert(`¡Reporte PDF "${fileName}" guardado en tu Google Drive correctamente!`);
    } catch (e: any) {
        console.error("PDF-Drive Error", e);
        alert(`Error al guardar PDF en Google Drive: ${e.message || 'Intente de nuevo.'}`);
    } finally {
        setUploadingToDrive(null);
    }
  };

  const handleSendEmail = async (type: 'consultations' | 'liquidations' | 'reconciliation' | 'pdf') => {
    if (!currentDoctor) return;
    if (!currentDoctor.email) {
      alert("El médico seleccionado no tiene un correo electrónico configurado. Por favor, edita los datos del médico para ingresar su dirección de correo.");
      return;
    }

    if (!googleToken) {
      if (confirm("Para enviar correos auténticos a través de Gmail, necesitas iniciar sesión con Google. ¿Deseas iniciar sesión?")) {
        signInWithGoogle();
      }
      return;
    }

    setSendingEmail(type);
    try {
      let attachmentBlob: Blob | undefined = undefined;
      let attachmentFileName = '';
      let reportNameSpanish = '';

      if (type === 'pdf') {
        if (!reportRef.current) return;
        setGeneratingPdf(true);
        const canvas = await html2canvas(reportRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        attachmentBlob = pdf.output('blob');
        attachmentFileName = `Informe_Estadistico_${currentDoctor.lastName}_${new Date().toISOString().split('T')[0]}.pdf`;
        reportNameSpanish = 'Informe Estadístico de Facturación';
        setGeneratingPdf(false);
      } else {
        let data: any[] = [];
        let title = '';
        if (type === 'consultations') {
            data = docConsultations.map(c => ({
                Fecha: formatDate(c.date),
                Paciente: c.patientName,
                Obra_Social: c.insurance,
                Estado: c.isReconciled ? 'Conciliado' : 'Pendiente'
            }));
            title = 'Planilla Planificada de Consultas';
            attachmentFileName = `Consultas_${currentDoctor.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
            reportNameSpanish = 'Planilla Planificada de Consultas';
        } else if (type === 'liquidations') {
            data = docLiquidations.map(l => ({
                Fecha_Realizado: formatDate(l.datePerformed),
                Fecha_Importacion: formatDate(l.importDate),
                Paciente: l.patientName,
                Obra_Social: l.insurance,
                Monto_Neto: l.netAmount,
                Estado: l.isMatched ? 'Conciliado' : 'Sin Asociar'
            }));
            title = 'Planilla Cargada de Liquidaciones';
            attachmentFileName = `Liquidaciones_${currentDoctor.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
            reportNameSpanish = 'Planilla Cargada de Liquidaciones';
        } else {
            data = reconciliationData;
            title = 'Reporte de Conciliación Completa y Auditoría';
            attachmentFileName = `Conciliacion_${currentDoctor.lastName}_${new Date().toISOString().split('T')[0]}.xlsx`;
            reportNameSpanish = 'Reporte de Conciliación Completa y Auditoría';
        }

        attachmentBlob = exportToStyledExcel({
            data,
            sheetName: type === 'reconciliation' ? 'Conciliación' : type === 'consultations' ? 'Consultas' : 'Liquidaciones',
            title,
            doctorName: `${currentDoctor.lastName}, ${currentDoctor.firstName}`,
            fileName: attachmentFileName,
            returnBlob: true
        }) as Blob;
      }

      // Elegant HTML mail design body
      const totalAmountStr = totalAmount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
      const bodyHtml = `
        <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
          <!-- Top Banner -->
          <div style="background-color: #0d9488; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">MedConcilia</h1>
            <p style="color: #ccfbf1; margin: 4px 0 0 0; font-size: 14px; font-weight: 500;">Conciliación y Auditoría de Facturación Médica</p>
          </div>
          
          <!-- Base Content -->
          <div style="padding: 32px 24px; background-color: #ffffff;">
            <h2 style="font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 16px;">Estimado/a Dr./Dra. ${currentDoctor.firstName} ${currentDoctor.lastName},</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
              Le hacemos llegar adjunto el reporte titulado <strong>"${reportNameSpanish}"</strong>, generado y conciliado de manera exitosa a través de la plataforma MedConcilia el día ${formatDate(new Date())}.
            </p>
            
            <!-- Summary Metrics table -->
            <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <h3 style="font-size: 14px; color: #0f172a; margin-top: 0; margin-bottom: 12px; font-weight: bold; text-transform: uppercase;">Resumen de Estado</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Consultas Conciliadas:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #0d9488;">${reconciledCount} de ${docConsultations.length}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Monto Total Recuperado/Cobrado:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #10b981;">${totalAmountStr}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Consultas Pendientes (No Cobradas):</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #f59e0b;">${docConsultations.length - reconciledCount}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Demora Promedio de Cobro:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #06b6d4;">${globalAvgDelayMonths} meses</td>
                </tr>
              </table>
            </div>
            
            <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin-bottom: 32px;">
              Este informe cuenta con la conciliación exhaustiva entre los turnos programados en su agenda y los pagos efectivamente liquidados por las distintas Obras Sociales y Prepagas.
            </p>
            
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;" />
            
            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
              Este es un correo automático enviado por MedConcilia. Por favor, no responder a este mensaje.
            </p>
          </div>
        </div>
      `;

      await sendGmailMessage({
        to: currentDoctor.email,
        subject: `MedConcilia: ${reportNameSpanish} - Dr./Dra. ${currentDoctor.lastName}`,
        bodyHtml,
        attachmentBlob,
        attachmentFileName
      });

      alert(`¡El correo con el archivo "${attachmentFileName}" ha sido enviado exitosamente al Dr./Dra. ${currentDoctor.lastName} (${currentDoctor.email})!`);
    } catch (e: any) {
      console.error(e);
      alert(`Error al enviar el correo por Gmail: ${e.message || 'Verifica la conexión.'}`);
    } finally {
      setSendingEmail(null);
      setGeneratingPdf(false);
    }
  };

  if (!selectedDoctorId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p className="text-xl">Seleccione un médico para generar reportes.</p>
      </div>
    );
  }

  const totalAmount = docLiquidations.reduce((sum, item) => sum + item.netAmount, 0);
  const reconciledCount = docConsultations.filter(c => c.isReconciled).length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">Reportes y Exportación</h2>
           <p className="text-slate-500 mt-1">
             Descarga de datos para <span className="font-semibold text-teal-600">{currentDoctor?.firstName} {currentDoctor?.lastName}</span>
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Card: Consultas */}
          <div className="p-6 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all flex flex-col items-center gap-4 text-slate-600">
             <div className="p-3 bg-teal-50 rounded-full">
                <FileSpreadsheet size={32} className="text-teal-600" />
             </div>
             <div className="text-center">
               <span className="font-semibold block text-slate-800">Planilla de Consultas</span>
               <span className="text-[11px] text-slate-400 block mt-0.5">Listado de turnos y pacientes cargados</span>
             </div>
             <div className="flex gap-1.5 w-full mt-2">
               <button 
                 onClick={() => downloadExcel('consultations')} 
                 className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-all"
                 title="Descargar Excel localmente"
               >
                 <Download size={14} /> Local
               </button>
               <button 
                 onClick={() => saveExcelToDrive('consultations')} 
                 disabled={uploadingToDrive === 'consultations'}
                 className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-sky-50 border border-sky-100 hover:bg-sky-100 text-sky-700 text-xs font-bold rounded-lg transition-all"
                 title="Guardar en Google Drive"
               >
                 {uploadingToDrive === 'consultations' ? <RefreshCw className="animate-spin w-3 h-3" /> : <Cloud size={14} />} Drive
               </button>
               <button 
                 onClick={() => handleSendEmail('consultations')} 
                 disabled={sendingEmail === 'consultations'}
                 className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-teal-50 border border-teal-100 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-lg transition-all"
                 title="Enviar al mail del médico"
               >
                 {sendingEmail === 'consultations' ? <RefreshCw className="animate-spin w-3 h-3" /> : <Mail size={14} />} Mail
               </button>
             </div>
          </div>

          {/* Card: Liquidaciones */}
          <div className="p-6 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all flex flex-col items-center gap-4 text-slate-600">
             <div className="p-3 bg-teal-50 rounded-full">
                <FileSpreadsheet size={32} className="text-teal-600" />
             </div>
             <div className="text-center">
               <span className="font-semibold block text-slate-800">Planilla de Liquidaciones</span>
               <span className="text-[11px] text-slate-400 block mt-0.5">Listado de cobros liquidados por obras sociales</span>
             </div>
             <div className="flex gap-1.5 w-full mt-2">
               <button 
                 onClick={() => downloadExcel('liquidations')} 
                 className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-all"
                 title="Descargar Excel localmente"
               >
                 <Download size={14} /> Local
               </button>
               <button 
                 onClick={() => saveExcelToDrive('liquidations')} 
                 disabled={uploadingToDrive === 'liquidations'}
                 className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-sky-50 border border-sky-100 hover:bg-sky-100 text-sky-700 text-xs font-bold rounded-lg transition-all"
                 title="Guardar en Google Drive"
               >
                 {uploadingToDrive === 'liquidations' ? <RefreshCw className="animate-spin w-3 h-3" /> : <Cloud size={14} />} Drive
               </button>
               <button 
                 onClick={() => handleSendEmail('liquidations')} 
                 disabled={sendingEmail === 'liquidations'}
                 className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-teal-50 border border-teal-100 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-lg transition-all"
                 title="Enviar al mail del médico"
               >
                 {sendingEmail === 'liquidations' ? <RefreshCw className="animate-spin w-3 h-3" /> : <Mail size={14} />} Mail
               </button>
             </div>
          </div>

          {/* Card: Reporte Conciliación Completa */}
          <div className="p-6 bg-emerald-50/50 border border-emerald-200 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col items-center gap-4 text-emerald-800">
             <div className="p-3 bg-white rounded-full border border-emerald-100">
                <CheckCircle size={32} className="text-emerald-600" />
             </div>
             <div className="text-center">
               <span className="font-bold block text-emerald-950">Conciliación Completa</span>
               <span className="text-[11px] text-emerald-600/80 block mt-0.5">Consolidación cruzada de consultas vs pagos</span>
             </div>
             <div className="flex gap-1.5 w-full mt-2">
               <button 
                 onClick={() => downloadExcel('reconciliation')} 
                 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all shadow-emerald-100"
               >
                 <Download size={14} /> Local
               </button>
               <button 
                 onClick={() => saveExcelToDrive('reconciliation')} 
                 disabled={uploadingToDrive === 'reconciliation'}
                 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all shadow-sky-100"
               >
                 {uploadingToDrive === 'reconciliation' ? <RefreshCw className="animate-spin w-3 h-3" /> : <Cloud size={14} />} Drive
               </button>
               <button 
                 onClick={() => handleSendEmail('reconciliation')} 
                 disabled={sendingEmail === 'reconciliation'}
                 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all shadow-teal-100"
                 title="Enviar al mail del médico"
               >
                 {sendingEmail === 'reconciliation' ? <RefreshCw className="animate-spin w-3 h-3" /> : <Mail size={14} />} Mail
               </button>
             </div>
          </div>
      </div>

      <div className="border-t border-slate-200 pt-8">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText size={24} className="text-teal-600" />
                Vista Previa de Reporte PDF
            </h3>
            <div className="flex gap-2.5 flex-wrap">
                <button 
                    onClick={downloadPDF} 
                    disabled={generatingPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:bg-slate-400 transition-all font-semibold text-sm"
                >
                    {generatingPdf ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Printer size={18} />}
                    {generatingPdf ? 'Generando...' : 'Descargar PDF'}
                </button>
                <button 
                    onClick={savePDFToDrive} 
                    disabled={uploadingToDrive === 'pdf'}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-slate-400 transition-all font-semibold text-sm"
                >
                    {uploadingToDrive === 'pdf' ? <RefreshCw className="animate-spin w-4 h-4" /> : <Cloud size={18} />}
                    {uploadingToDrive === 'pdf' ? 'Guardando...' : 'Guardar en Drive'}
                </button>
                <button 
                    onClick={() => handleSendEmail('pdf')} 
                    disabled={sendingEmail === 'pdf'}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-slate-400 transition-all font-semibold text-sm font-semibold"
                >
                    {sendingEmail === 'pdf' ? <RefreshCw className="animate-spin w-4 h-4" /> : <Mail size={18} />}
                    {sendingEmail === 'pdf' ? 'Enviando...' : 'Enviar por Mail'}
                </button>
            </div>
        </div>

        {/* PDF Capture Area */}
        <div className="bg-slate-100 p-4 rounded-xl overflow-auto">
            <div ref={reportRef} className="bg-white p-8 max-w-[210mm] mx-auto min-h-[297mm] shadow-lg">
                
                {/* PDF Header */}
                <div className="border-b-2 border-teal-600 pb-4 mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Informe de Facturación</h1>
                        <p className="text-teal-600 font-medium mt-1">MedConcilia</p>
                    </div>
                    <div className="text-right text-sm text-slate-500">
                        <p>Médico: <span className="font-bold text-slate-800">{currentDoctor?.firstName} {currentDoctor?.lastName}</span></p>
                        <p>Fecha: {formatDate(new Date())}</p>
                    </div>
                </div>

                {/* PDF Stats Grid */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-4 bg-teal-50 rounded-lg border border-teal-100">
                        <div className="flex items-center gap-3 mb-2">
                            <CheckCircle size={20} className="text-teal-600" />
                            <span className="text-sm font-semibold text-teal-800">Consultas Conciliadas</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{reconciledCount} <span className="text-sm text-slate-500 font-normal">/ {docConsultations.length}</span></p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                        <div className="flex items-center gap-3 mb-2">
                            <DollarSign size={20} className="text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-800">Total Liquidado</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">${totalAmount.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                        <div className="flex items-center gap-3 mb-2">
                            <AlertTriangle size={20} className="text-amber-600" />
                            <span className="text-sm font-semibold text-amber-800">Pendientes</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{docConsultations.length - reconciledCount}</p>
                    </div>
                     <div className="p-4 bg-cyan-50 rounded-lg border border-cyan-100">
                        <div className="flex items-center gap-3 mb-2">
                            <Clock size={20} className="text-cyan-600" />
                            <span className="text-sm font-semibold text-cyan-800">Promedio Demora</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">
                            {globalAvgDelayMonths} meses
                        </p>
                    </div>
                </div>

                {/* PDF Charts */}
                <div className="space-y-8">
                    <div className="h-64 border border-slate-100 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-slate-700 mb-4 border-l-4 border-teal-500 pl-2">Demora por Obra Social (Meses)</h4>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statsByInsurance} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                                <Bar dataKey="avgDelayMonths" fill="#0d9488" barSize={15} label={{ position: 'right', fill: '#64748b', fontSize: 10 }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="h-64 border border-slate-100 rounded-lg p-4">
                         <h4 className="text-lg font-bold text-slate-700 mb-4 border-l-4 border-emerald-500 pl-2">Valor Promedio por Consulta ($)</h4>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statsByInsurance}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} />
                                <YAxis hide />
                                <Bar dataKey="avgAmount" fill="#10b981" label={{ position: 'top', fill: '#64748b', fontSize: 10, formatter: (val: number) => `$${val}` }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-12 pt-4 border-t border-slate-200 text-center text-xs text-slate-400">
                    Generado automáticamente por MedConcilia
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};