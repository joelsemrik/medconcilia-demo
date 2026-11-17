import { Consultation, Liquidation } from '../types';
import * as XLSX from 'xlsx';

// Helper to normalize text for matching (removes special chars, lowercases, trims)
export const normalizeText = (text: string) => {
  if (!text) return '';
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/gi, '')
    .trim();
};

// Robust date parsing to parse DD-MM-YYYY, DD/MM/YYYY, etc.
export const parseExcelDate = (dateVal: any): string => {
  if (!dateVal) return new Date().toISOString();

  if (typeof dateVal === 'number') {
    // Excel serial date
    const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  const str = String(dateVal).trim();
  
  // Try matching DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/;
  const match = str.match(dmyRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed month
    const year = parseInt(match[3], 10);
    // Set to noon to avoid local timezone offsets shifting days
    const date = new Date(year, month, day, 12, 0, 0);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Try matching YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
  const ymdRegex = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/;
  const matchYmd = str.match(ymdRegex);
  if (matchYmd) {
    const year = parseInt(matchYmd[1], 10);
    const month = parseInt(matchYmd[2], 10) - 1;
    const day = parseInt(matchYmd[3], 10);
    const date = new Date(year, month, day, 12, 0, 0);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Fallback to standard JS parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }

  return new Date().toISOString();
};

// Global formatter to display as dd-mm-yyyy with hyphens
export const formatDate = (dateInput: any): string => {
  if (!dateInput) return '-';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '-';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return '-';
  }
};

// Intelligent column finder
const findValueByFuzzyKey = (row: any, keywords: string[]): any => {
  const rowKeys = Object.keys(row);
  
  // 1. Normalize keys from the Excel row
  // We map the original key to a normalized version
  const normalizedKeysMap: Record<string, string> = {};
  rowKeys.forEach(key => {
    normalizedKeysMap[normalizeText(key)] = key;
  });

  const normalizedRowKeys = Object.keys(normalizedKeysMap);

  // 2. Search for keyword matches
  for (const keyword of keywords) {
    const match = normalizedRowKeys.find(key => key.includes(keyword));
    if (match) {
      // Return the value using the original key
      return row[normalizedKeysMap[match]];
    }
  }

  return undefined;
};

export const parseConsultationFile = async (file: File, doctorId: string): Promise<Consultation[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

        const consultations: Consultation[] = jsonData.map((row: any, index) => {
          // Robust Keyword Lists
          const dateKeywords = ['fecha', 'date', 'dia', 'turno'];
          const nameKeywords = ['paciente', 'nombre', 'apellido', 'afiliado', 'beneficiario', 'cliente'];
          const insuranceKeywords = ['obra', 'social', 'financiador', 'cobertura', 'mutual', 'prepaga', 'seguro', 'os', 'plan', 'aseguradora'];

          // Find values using fuzzy logic
          const dateVal = findValueByFuzzyKey(row, dateKeywords);
          const nameVal = findValueByFuzzyKey(row, nameKeywords) || 'Paciente Desconocido';
          const insuranceVal = findValueByFuzzyKey(row, insuranceKeywords) || 'Particular';

          const parsedDate = parseExcelDate(dateVal);

          return {
            id: `cons-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
            doctorId,
            date: parsedDate,
            patientName: String(nameVal).trim(),
            insurance: String(insuranceVal).trim(),
            isReconciled: false,
          };
        });
        resolve(consultations);
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsBinaryString(file);
  });
};

export const parseLiquidationFile = async (file: File, doctorId: string): Promise<Liquidation[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

        const liquidations: Liquidation[] = jsonData.map((row: any, index) => {
           // Robust Keyword Lists
           const dateKeywords = ['fecha', 'date', 'realizado', 'prestacion'];
           const nameKeywords = ['paciente', 'nombre', 'apellido', 'afiliado'];
           const insuranceKeywords = ['obra', 'social', 'financiador', 'cobertura', 'mutual', 'prepaga', 'seguro', 'os'];
           const amountKeywords = ['monto', 'neto', 'valor', 'importe', 'total', 'liquidado', 'pagado'];

           const dateVal = findValueByFuzzyKey(row, dateKeywords);
           const nameVal = findValueByFuzzyKey(row, nameKeywords) || 'Desconocido';
           const insuranceVal = findValueByFuzzyKey(row, insuranceKeywords) || 'Particular';
           const amountVal = findValueByFuzzyKey(row, amountKeywords) || 0;

           const parsedDate = parseExcelDate(dateVal);

           // Clean amount string if necessary (e.g. "$ 1.500,00")
           let cleanAmount = amountVal;
           if (typeof amountVal === 'string') {
               cleanAmount = parseFloat(amountVal.replace(/[^0-9.-]+/g,""));
           }

          return {
            id: `liq-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
            doctorId,
            datePerformed: parsedDate,
            importDate: new Date().toISOString(),
            patientName: String(nameVal).trim(),
            insurance: String(insuranceVal).trim(),
            netAmount: Number(cleanAmount) || 0,
            isMatched: false,
          };
        });
        resolve(liquidations);
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsBinaryString(file);
  });
};