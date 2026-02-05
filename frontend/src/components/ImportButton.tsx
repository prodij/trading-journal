'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface ImportButtonProps {
  onImportComplete: () => void;
}

export function ImportButton({ onImportComplete }: ImportButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setResult({ type: 'error', message: data.error || 'Import failed' });
        return;
      }

      setResult({
        type: 'success',
        message: `Imported ${data.imported} trades (${data.skipped} duplicates skipped)`,
      });
      onImportComplete();
    } catch {
      setResult({ type: 'error', message: 'Network error during import' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
      >
        <Upload className="h-4 w-4 mr-2" />
        {importing ? 'Importing...' : 'Import CSV'}
      </Button>
      {result && (
        <span className={`text-sm ${result.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}
