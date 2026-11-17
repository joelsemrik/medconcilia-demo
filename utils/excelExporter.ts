import * as XLSX from 'xlsx';
import { formatDate } from './excelParser';

interface StyledExcelOptions {
  data: any[];
  sheetName?: string;
  title: string;
  doctorName?: string;
  fileName: string;
  returnBlob?: boolean;
}

/**
 * Exports data to a beautifully formatted Excel sheet.
 * Adds professional title headers, dynamic Column Widths,
 * formats status fields and calculates totals automatically.
 */
export const exportToStyledExcel = (options: StyledExcelOptions): Blob | void => {
  const { data, sheetName = "Reporte", title, doctorName, fileName, returnBlob = false } = options;

  // structured array of arrays format for SheetJS aoa_to_sheet
  const matrix: any[][] = [];

  // Row 1: Professional App Header
  matrix.push([`MEDCONCILIA - RECONCILIACIÓN DE FACTURACIÓN MÉDICA`]);
  
  // Row 2: Subtitle (What report this is)
  matrix.push([title.toUpperCase()]);

  // Row 3: Metadata (Doctor name if applicable)
  if (doctorName) {
    matrix.push([`Médico: ${doctorName}`]);
  } else {
    matrix.push([]);
  }

  // Row 4: Generation date and time
  matrix.push([`Fecha de Emisión: ${formatDate(new Date())} a las ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`]);
  
  // Row 5: Blank spacer before table headers
  matrix.push([]);

  let formattedHeaders: string[] = [];
  let keys: string[] = [];

  if (data.length === 0) {
    matrix.push(["Sin registros para exportar en este período."]);
  } else {
    keys = Object.keys(data[0]);
    // Transform system keys to user-friendly Spanish headers (e.g. 'amount_net' -> 'Amount Net')
    formattedHeaders = keys.map(k => {
      const words = k.replace(/_/g, ' ').split(' ');
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    });

    // Row 6: Header row
    matrix.push(formattedHeaders);

    // Row 7 onwards: Data rows
    data.forEach(item => {
      matrix.push(keys.map(k => {
        const val = item[k];
        if (typeof val === 'boolean') {
          return val ? 'Conciliado' : 'Pendiente';
        }
        return val === null || val === undefined || val === '' ? '-' : val;
      }));
    });

    // Check if there are columns with numeric amounts to generate an automatic Total General sum row
    const numericIndices: number[] = [];
    keys.forEach((key, index) => {
      const kLower = key.toLowerCase();
      if (kLower.includes('monto') || kLower.includes('neto') || kLower.includes('valor') || kLower.includes('total') || kLower.includes('amount')) {
        numericIndices.push(index);
      }
    });

    if (numericIndices.length > 0) {
      matrix.push([]); // blank spacer row before total
      
      const totalRow = new Array(keys.length).fill('');
      totalRow[0] = 'TOTAL GENERAL';

      numericIndices.forEach(colIndex => {
        const sumVal = data.reduce((sum, item) => {
          const rawVal = item[keys[colIndex]];
          const valNum = typeof rawVal === 'number' ? rawVal : Number(String(rawVal).replace(/[^0-9.-]+/g, ""));
          return sum + (isNaN(valNum) ? 0 : valNum);
        }, 0);

        // Format to spanish currency or keep as clean number
        totalRow[colIndex] = sumVal;
      });

      matrix.push(totalRow);
    }
  }

  // Create standard Sheet
  const ws = XLSX.utils.aoa_to_sheet(matrix);

  // Set precise column widths based on content length
  // We ignore banner row lengths so they don't stretch the first column infinitely
  const colWidths: number[] = [];
  if (data.length > 0) {
    keys.forEach((_, colIndex) => {
      let maxLen = formattedHeaders[colIndex] ? formattedHeaders[colIndex].length : 12;
      
      // inspect cell lengths in this column
      data.forEach(item => {
        const cellVal = item[keys[colIndex]];
        const strLen = cellVal !== null && cellVal !== undefined ? String(cellVal).length : 0;
        if (strLen > maxLen) {
          maxLen = strLen;
        }
      });
      
      colWidths[colIndex] = Math.min(Math.max(maxLen + 4, 12), 45); // Bounds: 12 - 45 chars width
    });
    
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  if (returnBlob) {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } else {
    XLSX.writeFile(wb, fileName);
  }
};
