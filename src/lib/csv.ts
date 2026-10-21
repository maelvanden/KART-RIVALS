import { File, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';

type Cell = string | number | null | undefined;

/** Lignes → CSV lisible par Excel, Numbers et Google Sheets (séparateur « ; », virgule décimale française). */
export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/** Enregistre le CSV et ouvre la feuille de partage (Fichiers, Mail, Numbers, Excel…), ou le télécharge sur le web. */
export async function shareCsv(filename: string, csv: string) {
  const content = `﻿${csv}`; // BOM : accents corrects à l'ouverture dans Excel.
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  try {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    // iOS partage le fichier lui-même ; Android ne sait partager qu'un texte avec Share.
    if (Platform.OS === 'ios') await Share.share({ url: file.uri, title: filename });
    else await Share.share({ message: csv, title: filename });
  } catch {
    await Share.share({ message: csv, title: filename });
  }
}
