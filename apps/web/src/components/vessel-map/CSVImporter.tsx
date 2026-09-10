import { FileText, Upload } from 'lucide-react';
import { useRef } from 'react';

export default function CSVImporter({ fileName, onFile }: { fileName: string | null; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
        <Upload size={16} /> Importer CSV
      </button>
      <span className="vessel-file-chip">
        <FileText size={14} /> {fileName || 'Aucun fichier'}
      </span>
    </>
  );
}
