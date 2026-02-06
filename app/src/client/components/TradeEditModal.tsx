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

    const fields: Record<string, unknown> = {};
    const numericFields = new Set([
      'strike', 'quantity', 'entry_price', 'exit_price',
      'entry_amount', 'exit_amount', 'commission_total', 'conviction_level',
    ]);

    for (const [key, value] of Object.entries(form)) {
      const original = (trade as unknown as Record<string, unknown>)[key];
      const formVal = value === '' ? null : value;

      let finalVal: unknown = formVal;
      if (numericFields.has(key) && typeof formVal === 'string') {
        finalVal = parseFloat(formVal);
        if (isNaN(finalVal as number)) finalVal = null;
      }

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
            {/* P/L Summary */}
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
