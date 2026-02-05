# CSV Upload & Trade Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add web UI for CSV upload (via Python CLI) and full trade editing (via direct SQLite writes) to the trading journal dashboard.

**Architecture:** CSV uploads POST to a Next.js API route that shells out to the existing Python CLI. Trade edits PATCH directly to SQLite via a read-write connection. Both features integrate into the existing single-page dashboard.

**Tech Stack:** Next.js 16, React 19, TypeScript, shadcn/ui (Sheet, Input, Select, Label, Textarea, Checkbox), better-sqlite3, child_process

---

### Task 1: Install shadcn/ui form components

We need Sheet, Input, Select, Label, Textarea, and Checkbox — none of which exist yet.

**Step 1: Install components**

Run from `frontend/`:
```bash
cd /home/james/Projects/trading-journal/frontend
npx shadcn@latest add sheet input select label textarea checkbox -y
```

Expected: Creates files in `frontend/src/components/ui/` for each component.

**Step 2: Verify installation**

Run:
```bash
ls frontend/src/components/ui/
```

Expected: See `sheet.tsx`, `input.tsx`, `select.tsx`, `label.tsx`, `textarea.tsx`, `checkbox.tsx` alongside existing files.

**Step 3: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "chore: add shadcn form components (sheet, input, select, label, textarea, checkbox)"
```

---

### Task 2: Add read-write database connection

**Files:**
- Modify: `frontend/src/lib/db.ts`

**Step 1: Add getWriteDb function and updateTrade helper**

In `frontend/src/lib/db.ts`, add after the existing `getDb()` function (line 32):

```typescript
let writeDb: Database.Database | null = null;

export function getWriteDb(): Database.Database {
  if (!writeDb) {
    writeDb = new Database(DB_PATH);
  }
  return writeDb;
}
```

**Step 2: Add the TradeDetail interface**

Add after the existing `Trade` interface (after line 48):

```typescript
export interface TradeDetail {
  id: number;
  date: string;
  underlying: string;
  expiration: string | null;
  strike: number | null;
  option_type: string | null;
  direction: string | null;
  quantity: number;
  entry_price: number;
  exit_price: number;
  entry_amount: number | null;
  exit_amount: number | null;
  gross_pnl: number;
  net_pnl: number;
  commission_total: number | null;
  pnl_percent: number | null;
  entry_time: string | null;
  exit_time: string | null;
  hold_time_minutes: number | null;
  setup_type: string | null;
  market_regime: string | null;
  time_of_day: string | null;
  conviction_level: number | null;
  followed_plan: boolean | null;
  mistake_type: string | null;
  lesson: string | null;
  grade: string | null;
  notes: string | null;
  tags: string | null;
}
```

**Step 3: Add getTradeById and updateTrade functions**

Add at the end of `frontend/src/lib/db.ts`:

```typescript
export function getTradeById(id: number): TradeDetail | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM round_trips WHERE id = ?').get(id) as TradeDetail | undefined;
}

const ALLOWED_FIELDS = new Set([
  'date', 'underlying', 'expiration', 'strike', 'option_type', 'direction',
  'quantity', 'entry_price', 'exit_price', 'entry_amount', 'exit_amount',
  'gross_pnl', 'net_pnl', 'commission_total', 'pnl_percent',
  'entry_time', 'exit_time', 'hold_time_minutes',
  'setup_type', 'market_regime', 'time_of_day', 'conviction_level',
  'followed_plan', 'mistake_type', 'lesson', 'grade', 'notes', 'tags',
]);

export function updateTrade(id: number, fields: Record<string, unknown>): TradeDetail | undefined {
  const db = getWriteDb();

  // Filter to allowed fields only
  const entries = Object.entries(fields).filter(([key]) => ALLOWED_FIELDS.has(key));
  if (entries.length === 0) return getTradeById(id);

  const setClauses = entries.map(([key]) => `${key} = ?`);
  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  const values = entries.map(([, value]) => value);

  db.prepare(
    `UPDATE round_trips SET ${setClauses.join(', ')} WHERE id = ?`
  ).run(...values, id);

  // Re-read using read-only connection (need to close/reopen to see writes)
  // Use the write db to read back since it will see its own writes
  return db.prepare('SELECT * FROM round_trips WHERE id = ?').get(id) as TradeDetail | undefined;
}
```

**Step 4: Commit**

```bash
git add frontend/src/lib/db.ts
git commit -m "feat: add read-write database connection and trade update helpers"
```

---

### Task 3: Create GET/PATCH API route for single trade

**Files:**
- Create: `frontend/src/app/api/trades/[id]/route.ts`

**Step 1: Create the route file**

Create `frontend/src/app/api/trades/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getTradeById, updateTrade } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tradeId = parseInt(id, 10);
    if (isNaN(tradeId)) {
      return NextResponse.json({ error: 'Invalid trade ID' }, { status: 400 });
    }

    const trade = getTradeById(tradeId);
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json({ trade });
  } catch (error) {
    console.error('Error fetching trade:', error);
    return NextResponse.json({ error: 'Failed to fetch trade' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tradeId = parseInt(id, 10);
    if (isNaN(tradeId)) {
      return NextResponse.json({ error: 'Invalid trade ID' }, { status: 400 });
    }

    const body = await request.json();
    const { fields } = body;

    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'Missing fields object' }, { status: 400 });
    }

    // Recalculate P/L if price fields changed
    const recalcFields = { ...fields };
    const priceChanged = 'entry_price' in fields || 'exit_price' in fields
      || 'entry_amount' in fields || 'exit_amount' in fields || 'commission_total' in fields;

    if (priceChanged) {
      // Get current trade to fill in missing values
      const current = getTradeById(tradeId);
      if (!current) {
        return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
      }

      const entryAmount = recalcFields.entry_amount ?? current.entry_amount ?? 0;
      const exitAmount = recalcFields.exit_amount ?? current.exit_amount ?? 0;
      const commission = recalcFields.commission_total ?? current.commission_total ?? 0;
      const entryPrice = recalcFields.entry_price ?? current.entry_price;
      const exitPrice = recalcFields.exit_price ?? current.exit_price;
      const quantity = recalcFields.quantity ?? current.quantity;

      recalcFields.gross_pnl = (exitPrice - entryPrice) * quantity * 100;
      recalcFields.net_pnl = exitAmount + entryAmount; // entryAmount is negative
      recalcFields.pnl_percent = entryPrice > 0 ? ((exitPrice / entryPrice) - 1) * 100 : 0;
    }

    // Recalculate hold time if times changed
    if ('entry_time' in fields || 'exit_time' in fields) {
      const current = getTradeById(tradeId);
      if (current) {
        const entryTime = recalcFields.entry_time ?? current.entry_time;
        const exitTime = recalcFields.exit_time ?? current.exit_time;
        if (entryTime && exitTime) {
          const [eh, em] = entryTime.split(':').map(Number);
          const [xh, xm] = exitTime.split(':').map(Number);
          recalcFields.hold_time_minutes = (xh * 60 + xm) - (eh * 60 + em);
        }
      }
    }

    const updated = updateTrade(tradeId, recalcFields);
    if (!updated) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json({ trade: updated });
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
  }
}
```

**Step 2: Verify build**

Run:
```bash
cd /home/james/Projects/trading-journal/frontend && npx next build 2>&1 | tail -5
```

Expected: Build succeeds (or at least no TypeScript errors on the new file).

**Step 3: Commit**

```bash
git add frontend/src/app/api/trades/\\[id\\]/route.ts
git commit -m "feat: add GET/PATCH API route for single trade editing"
```

---

### Task 4: Create CSV import API route

**Files:**
- Create: `frontend/src/app/api/import/route.ts`

**Step 1: Create the import route**

Create `frontend/src/app/api/import/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

function findProjectRoot(): string {
  // Support both local dev (frontend/) and Docker (/app/)
  const cwd = process.cwd();
  if (cwd.endsWith('/frontend')) {
    return path.resolve(cwd, '..');
  }
  return cwd;
}

export async function POST(request: Request) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a .csv' }, { status: 400 });
    }

    // Write to temp file
    const buffer = Buffer.from(await file.arrayBuffer());
    tempPath = path.join(tmpdir(), `import-${randomUUID()}.csv`);
    await writeFile(tempPath, buffer);

    // Shell out to Python CLI
    const projectRoot = findProjectRoot();
    const scriptPath = path.join(projectRoot, 'src', 'journal.py');

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        'python3',
        [scriptPath, 'import', tempPath!],
        { cwd: projectRoot, timeout: 30000 },
        (error, stdout, stderr) => {
          if (error && !stdout) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        }
      );
    });

    // Parse result from stdout (format: "✅ Imported X executions (Y duplicates skipped)")
    const match = result.stdout.match(/Imported (\d+) executions \((\d+) duplicates skipped\)/);
    const imported = match ? parseInt(match[1], 10) : 0;
    const skipped = match ? parseInt(match[2], 10) : 0;

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      message: result.stdout.trim(),
    });
  } catch (error) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Clean up temp file
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/import/route.ts
git commit -m "feat: add CSV import API route (shells out to Python CLI)"
```

---

### Task 5: Create ImportButton component

**Files:**
- Create: `frontend/src/components/ImportButton.tsx`

**Step 1: Create the component**

Create `frontend/src/components/ImportButton.tsx`:

```tsx
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
      // Reset file input so same file can be re-uploaded
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
```

**Step 2: Commit**

```bash
git add frontend/src/components/ImportButton.tsx
git commit -m "feat: add ImportButton component for CSV upload"
```

---

### Task 6: Create TradeEditModal component

**Files:**
- Create: `frontend/src/components/TradeEditModal.tsx`

**Step 1: Create the component**

Create `frontend/src/components/TradeEditModal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface TradeDetail {
  id: number;
  date: string;
  underlying: string;
  expiration: string | null;
  strike: number | null;
  option_type: string | null;
  direction: string | null;
  quantity: number;
  entry_price: number;
  exit_price: number;
  entry_amount: number | null;
  exit_amount: number | null;
  gross_pnl: number;
  net_pnl: number;
  commission_total: number | null;
  pnl_percent: number | null;
  entry_time: string | null;
  exit_time: string | null;
  hold_time_minutes: number | null;
  setup_type: string | null;
  market_regime: string | null;
  time_of_day: string | null;
  conviction_level: number | null;
  followed_plan: boolean | null;
  mistake_type: string | null;
  lesson: string | null;
  grade: string | null;
  notes: string | null;
  tags: string | null;
}

const SETUP_TYPES = [
  'pullback', 'breakout', 'reversal', 'scalp', 'gamma_scalp',
  'earnings_play', 'trend_follow', 'mean_reversion', 'support_bounce', 'resistance_fade',
];

const MISTAKE_TYPES = [
  'early_entry', 'late_entry', 'early_exit', 'late_exit',
  'fomo', 'revenge', 'oversize', 'no_plan', 'ignored_stop',
];

const GRADES = ['A', 'B', 'C', 'D', 'F'];

const MARKET_REGIMES = ['trending_up', 'trending_down', 'range', 'volatile'];

const TIME_OF_DAY = ['open', 'morning', 'midday', 'afternoon', 'close'];

interface TradeEditModalProps {
  tradeId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function TradeEditModal({ tradeId, open, onClose, onSaved }: TradeEditModalProps) {
  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — mirrors TradeDetail but as strings for inputs
  const [form, setForm] = useState<Record<string, string | boolean | null>>({});

  useEffect(() => {
    if (!tradeId || !open) return;

    setLoading(true);
    setError(null);

    fetch(`/api/trades/${tradeId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.trade) {
          setTrade(data.trade);
          // Initialize form with current values
          setForm({
            date: data.trade.date || '',
            underlying: data.trade.underlying || '',
            expiration: data.trade.expiration || '',
            strike: data.trade.strike?.toString() || '',
            option_type: data.trade.option_type || '',
            direction: data.trade.direction || '',
            quantity: data.trade.quantity?.toString() || '',
            entry_price: data.trade.entry_price?.toString() || '',
            exit_price: data.trade.exit_price?.toString() || '',
            entry_amount: data.trade.entry_amount?.toString() || '',
            exit_amount: data.trade.exit_amount?.toString() || '',
            commission_total: data.trade.commission_total?.toString() || '',
            entry_time: data.trade.entry_time || '',
            exit_time: data.trade.exit_time || '',
            setup_type: data.trade.setup_type || '',
            market_regime: data.trade.market_regime || '',
            time_of_day: data.trade.time_of_day || '',
            conviction_level: data.trade.conviction_level?.toString() || '',
            followed_plan: data.trade.followed_plan ?? false,
            mistake_type: data.trade.mistake_type || '',
            lesson: data.trade.lesson || '',
            grade: data.trade.grade || '',
            notes: data.trade.notes || '',
            tags: data.trade.tags || '',
          });
        }
      })
      .catch(() => setError('Failed to load trade'))
      .finally(() => setLoading(false));
  }, [tradeId, open]);

  function updateField(key: string, value: string | boolean | null) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!trade) return;
    setSaving(true);
    setError(null);

    // Build changed fields only
    const fields: Record<string, unknown> = {};
    const numericFields = new Set([
      'strike', 'quantity', 'entry_price', 'exit_price',
      'entry_amount', 'exit_amount', 'commission_total', 'conviction_level',
    ]);

    for (const [key, value] of Object.entries(form)) {
      const original = (trade as Record<string, unknown>)[key];
      const formVal = value === '' ? null : value;

      // Convert numeric strings
      let finalVal: unknown = formVal;
      if (numericFields.has(key) && typeof formVal === 'string') {
        finalVal = parseFloat(formVal);
        if (isNaN(finalVal as number)) finalVal = null;
      }

      // Compare with original
      const origVal = original ?? null;
      if (finalVal !== origVal) {
        fields[key] = finalVal;
      }
    }

    if (Object.keys(fields).length === 0) {
      onClose();
      return;
    }

    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Save failed');
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {trade ? `Edit Trade #${trade.id}` : 'Edit Trade'}
          </SheetTitle>
        </SheetHeader>

        {loading && <p className="p-4 text-muted-foreground">Loading...</p>}
        {error && <p className="p-4 text-red-600 text-sm">{error}</p>}

        {trade && !loading && (
          <div className="space-y-6 py-4">
            {/* P/L Summary (read-only context) */}
            <div className={`text-center text-2xl font-bold ${trade.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${trade.net_pnl.toFixed(2)}
            </div>

            {/* Section 1: Trade Details */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Trade Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={form.date as string} onChange={(e) => updateField('date', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="underlying">Underlying</Label>
                  <Input id="underlying" value={form.underlying as string} onChange={(e) => updateField('underlying', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="expiration">Expiration</Label>
                  <Input id="expiration" type="date" value={form.expiration as string} onChange={(e) => updateField('expiration', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="strike">Strike</Label>
                  <Input id="strike" type="number" step="0.5" value={form.strike as string} onChange={(e) => updateField('strike', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="option_type">Type</Label>
                  <Select value={form.option_type as string} onValueChange={(v) => updateField('option_type', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Call">Call</SelectItem>
                      <SelectItem value="Put">Put</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="direction">Direction</Label>
                  <Select value={form.direction as string} onValueChange={(v) => updateField('direction', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Long">Long</SelectItem>
                      <SelectItem value="Short">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input id="quantity" type="number" value={form.quantity as string} onChange={(e) => updateField('quantity', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="entry_price">Entry Price</Label>
                  <Input id="entry_price" type="number" step="0.01" value={form.entry_price as string} onChange={(e) => updateField('entry_price', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="exit_price">Exit Price</Label>
                  <Input id="exit_price" type="number" step="0.01" value={form.exit_price as string} onChange={(e) => updateField('exit_price', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="entry_amount">Entry Amount</Label>
                  <Input id="entry_amount" type="number" step="0.01" value={form.entry_amount as string} onChange={(e) => updateField('entry_amount', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="exit_amount">Exit Amount</Label>
                  <Input id="exit_amount" type="number" step="0.01" value={form.exit_amount as string} onChange={(e) => updateField('exit_amount', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="commission_total">Commission</Label>
                  <Input id="commission_total" type="number" step="0.01" value={form.commission_total as string} onChange={(e) => updateField('commission_total', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="entry_time">Entry Time</Label>
                  <Input id="entry_time" type="time" value={form.entry_time as string} onChange={(e) => updateField('entry_time', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="exit_time">Exit Time</Label>
                  <Input id="exit_time" type="time" value={form.exit_time as string} onChange={(e) => updateField('exit_time', e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Review */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Review</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Setup Type</Label>
                  <Select value={form.setup_type as string} onValueChange={(v) => updateField('setup_type', v)}>
                    <SelectTrigger><SelectValue placeholder="Select setup" /></SelectTrigger>
                    <SelectContent>
                      {SETUP_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Grade</Label>
                  <Select value={form.grade as string} onValueChange={(v) => updateField('grade', v)}>
                    <SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Conviction (1-5)</Label>
                  <Select value={form.conviction_level as string} onValueChange={(v) => updateField('conviction_level', v)}>
                    <SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mistake Type</Label>
                  <Select value={form.mistake_type as string} onValueChange={(v) => updateField('mistake_type', v)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {MISTAKE_TYPES.map((m) => (
                        <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Market Regime</Label>
                  <Select value={form.market_regime as string} onValueChange={(v) => updateField('market_regime', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {MARKET_REGIMES.map((r) => (
                        <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Time of Day</Label>
                  <Select value={form.time_of_day as string} onValueChange={(v) => updateField('time_of_day', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {TIME_OF_DAY.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Checkbox
                  id="followed_plan"
                  checked={form.followed_plan as boolean}
                  onCheckedChange={(v) => updateField('followed_plan', v === true)}
                />
                <Label htmlFor="followed_plan">Followed plan</Label>
              </div>

              <div className="mt-3">
                <Label htmlFor="lesson">Lesson</Label>
                <Input id="lesson" value={form.lesson as string} onChange={(e) => updateField('lesson', e.target.value)} placeholder="What did you learn?" />
              </div>

              <div className="mt-3">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={form.notes as string} onChange={(e) => updateField('notes', e.target.value)} placeholder="Trade notes..." rows={3} />
              </div>
            </div>

            <Separator />

            {/* Section 3: Tags */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Tags</h3>
              <Input value={form.tags as string} onChange={(e) => updateField('tags', e.target.value)} placeholder="tag1, tag2, tag3" />
            </div>
          </div>
        )}

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/TradeEditModal.tsx
git commit -m "feat: add TradeEditModal component with full field editing"
```

---

### Task 7: Integrate ImportButton and TradeEditModal into dashboard

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Add imports**

At the top of `page.tsx` (after line 15), add:

```typescript
import { ImportButton } from '@/components/ImportButton';
import { TradeEditModal } from '@/components/TradeEditModal';
```

**Step 2: Add state for editing**

Inside `Dashboard()` function, after the existing state declarations (after line 202), add:

```typescript
const [editTradeId, setEditTradeId] = useState<number | null>(null);
const [editOpen, setEditOpen] = useState(false);
```

**Step 3: Add a refreshData function**

Extract the fetch logic into a reusable function. After the new state (and before the `useEffect`), add:

```typescript
async function refreshData() {
  try {
    const [tradesRes, statsRes, setupsRes, equityRes, lossesRes, timeRes, symbolRes, edgeRes] = await Promise.all([
      fetch('/api/trades'),
      fetch('/api/stats'),
      fetch('/api/setups'),
      fetch('/api/equity'),
      fetch('/api/losses'),
      fetch('/api/time-performance'),
      fetch('/api/symbol-performance'),
      fetch('/api/edge'),
    ]);

    const tradesData = await tradesRes.json();
    const statsData = await statsRes.json();
    const setupsData = await setupsRes.json();
    const equityData = await equityRes.json();
    const lossesJson = await lossesRes.json();
    const timeJson = await timeRes.json();
    const symbolJson = await symbolRes.json();
    const edgeJson = await edgeRes.json();

    setTrades(tradesData.trades || []);
    setSummaries(tradesData.summaries || []);
    setStats(statsData.stats);
    setSetups(setupsData.setups || []);
    setEquity(equityData.equity || []);
    setLossesData(lossesJson);
    setTimeData(timeJson);
    setSymbolData(symbolJson);
    setEdgeData(edgeJson);
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}
```

Then simplify the `useEffect` to use it:

```typescript
useEffect(() => {
  async function fetchData() {
    await refreshData();
    setLoading(false);
  }
  fetchData();
}, []);
```

**Step 4: Add ImportButton to header**

In the header section (around line 261), change the header `<div>` to include ImportButton:

Replace:
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold">Trading Journal</h1>
    <p className="text-muted-foreground">Track, analyze, improve</p>
  </div>
  <Badge variant={stats && stats.net_pnl >= 0 ? "default" : "destructive"} className="text-lg px-4 py-2">
    {stats ? `$${stats.net_pnl.toFixed(2)}` : '$0.00'} (30d)
  </Badge>
</div>
```

With:
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold">Trading Journal</h1>
    <p className="text-muted-foreground">Track, analyze, improve</p>
  </div>
  <div className="flex items-center gap-4">
    <ImportButton onImportComplete={refreshData} />
    <Badge variant={stats && stats.net_pnl >= 0 ? "default" : "destructive"} className="text-lg px-4 py-2">
      {stats ? `$${stats.net_pnl.toFixed(2)}` : '$0.00'} (30d)
    </Badge>
  </div>
</div>
```

**Step 5: Make trade rows clickable**

In the Trades tab (around line 976), change the `<TableRow>` for each trade:

Replace:
```tsx
<TableRow key={trade.id}>
```

With:
```tsx
<TableRow key={trade.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditTradeId(trade.id); setEditOpen(true); }}>
```

**Step 6: Add the TradeEditModal**

Before the closing `</div>` of the root container (just before line 1081 `</div>`), add:

```tsx
<TradeEditModal
  tradeId={editTradeId}
  open={editOpen}
  onClose={() => { setEditOpen(false); setEditTradeId(null); }}
  onSaved={refreshData}
/>
```

**Step 7: Verify dev server**

Run:
```bash
cd /home/james/Projects/trading-journal/frontend && pnpm dev -p 4000
```

Visit http://localhost:4000, verify:
1. Import CSV button appears in header
2. Clicking a trade row in the Trades tab opens the edit sheet
3. No console errors

**Step 8: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: integrate ImportButton and TradeEditModal into dashboard"
```

---

### Task 8: Manual verification

**Step 1: Test CSV upload**

1. Open http://localhost:4000
2. Click "Import CSV" button
3. Select an E*Trade CSV file
4. Verify success message shows imported count
5. Verify trades appear in the Trades tab

**Step 2: Test trade editing**

1. Go to Trades tab
2. Click any trade row
3. Verify the edit sheet opens with correct data
4. Change the setup_type dropdown
5. Add a note
6. Click Save
7. Verify the trade updates in the table

**Step 3: Test P/L recalculation**

1. Open a trade
2. Change entry_price or exit_price
3. Save
4. Verify the P/L column in the trades table reflects the recalculated value

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: adjustments from manual testing"
```
