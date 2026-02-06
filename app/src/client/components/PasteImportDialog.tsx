import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ClipboardPaste } from 'lucide-react';

interface PasteImportDialogProps {
  onImportComplete: () => void;
}

function countExecutedRows(text: string): number {
  if (!text.trim()) return 0;
  return text.split(/\r?\n/).filter(line => {
    const fields = line.split('\t');
    return fields.length >= 6 && fields[0].trim() === 'Executed';
  }).length;
}

export function PasteImportDialog({ onImportComplete }: PasteImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const executedCount = useMemo(() => countExecutedRows(text), [text]);

  async function handleImport() {
    if (!text.trim()) return;

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch('/api/import/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ type: 'error', message: data.error || 'Import failed' });
        return;
      }

      setResult({ type: 'success', message: data.message });
      onImportComplete();
    } catch {
      setResult({ type: 'error', message: 'Network error during import' });
    } finally {
      setImporting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setText('');
      setResult(null);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste className="h-4 w-4 mr-2" />
        Paste Orders
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Paste E*Trade Orders</SheetTitle>
            <SheetDescription>
              Copy order history from E*Trade's web UI and paste below to add execution timestamps.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4">
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); }}
              placeholder={'Executed\tBuy Open 1 QQQ Feb 06 \'26 $597 Put...\t02/05/26 11:20:00 AM EST\t1\t4.92\t0.514'}
              rows={8}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {executedCount > 0
                  ? `Found ${executedCount} executed order${executedCount !== 1 ? 's' : ''}`
                  : 'Paste order history above'}
              </span>
              <Button
                onClick={handleImport}
                disabled={importing || executedCount === 0}
              >
                {importing ? 'Importing...' : 'Import'}
              </Button>
            </div>

            {result && (
              <Badge
                variant={result.type === 'success' ? 'default' : 'destructive'}
                className="text-sm py-2 justify-center"
              >
                {result.message}
              </Badge>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
