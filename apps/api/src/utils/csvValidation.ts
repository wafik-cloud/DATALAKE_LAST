import { CsvValidationResult } from '../types/pelagic';

function looksLikeHtml(text: string): boolean {
  const sample = text.slice(0, 500).toLowerCase();
  return sample.includes('<!doctype html') || sample.includes('<html');
}

function looksLikeJsonError(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null && ('error' in parsed || 'message' in parsed);
  } catch {
    return false;
  }
}

export function validateCsvResponse(buffer: Buffer, contentType?: string): CsvValidationResult {
  if (!buffer.length) {
    return { valid: false, emptyData: true, rowCount: 0, headerLine: '', message: 'Réponse vide' };
  }

  const textStart = buffer.slice(0, Math.min(buffer.length, 4096)).toString('utf8');

  if (looksLikeHtml(textStart)) {
    return { valid: false, emptyData: false, rowCount: 0, headerLine: '', message: 'Réponse HTML inattendue' };
  }

  if (looksLikeJsonError(textStart)) {
    return { valid: false, emptyData: false, rowCount: 0, headerLine: '', message: 'Réponse JSON d\'erreur' };
  }

  if (contentType && !contentType.includes('csv') && !contentType.includes('text/plain') && !contentType.includes('octet-stream')) {
    return {
      valid: false,
      emptyData: false,
      rowCount: 0,
      headerLine: '',
      message: `Type MIME inattendu: ${contentType}`,
    };
  }

  const lines = textStart.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return { valid: false, emptyData: true, rowCount: 0, headerLine: '', message: 'Fichier sans contenu' };
  }

  const headerLine = lines[0];
  const dataRows = lines.length - 1;

  if (dataRows === 0) {
    return {
      valid: true,
      emptyData: true,
      rowCount: 0,
      headerLine,
      message: 'Aucune donnée disponible pour la période sélectionnée.',
    };
  }

  return {
    valid: true,
    emptyData: false,
    rowCount: dataRows,
    headerLine,
  };
}
