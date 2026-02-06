import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

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

const GRADES = ['A', 'B', 'C', 'D', 'F'] as const;

const MARKET_REGIMES = ['trending_up', 'trending_down', 'range', 'volatile'];

const TIME_OF_DAY = ['open', 'morning', 'midday', 'afternoon', 'close'];

interface TradeEditModalProps {
  tradeId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function StatCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : 'font-medium'}`}>{value || '\u2014'}</div>
    </div>
  );
}

/** Convert stored EST time to PST (subtract 3 hours) and format as 12h. */
function formatTime(time: string | null): string {
  if (!time) return '\u2014';
  const [h, m] = time.split(':');
  let hour = parseInt(h) - 3; // EST -> PST
  if (hour < 0) hour += 24;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} PST`;
}

function formatHoldTime(minutes: number | null): string {
  if (!minutes) return '\u2014';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

  const isWin = trade && trade.net_pnl >= 0;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 gap-0 flex flex-col">
        <SheetTitle className="sr-only">
          {trade ? `Trade #${trade.id} — ${trade.underlying}` : 'Trade Details'}
        </SheetTitle>
        <SheetDescription className="sr-only">
          View trade details and add your review
        </SheetDescription>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-muted-foreground animate-pulse">Loading trade...</div>
          </div>
        )}
        {error && (
          <div className="mx-5 mt-5 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {trade && !loading && (
          <>
            {/* ── Hero: P/L + Trade Identity ── */}
            <div className={`px-6 pt-6 pb-5 ${
              isWin
                ? 'bg-gradient-to-b from-green-50 to-transparent dark:from-green-950/20'
                : 'bg-gradient-to-b from-red-50 to-transparent dark:from-red-950/20'
            }`}>
              {/* Top row: ticker + badges */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">{trade.underlying}</h2>
                    {trade.option_type && (
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        ${trade.strike} {trade.option_type}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {trade.date}
                    {trade.expiration && ` \u00B7 Exp ${trade.expiration}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {trade.direction && (
                    <Badge
                      variant={trade.direction === 'Long' ? 'default' : 'secondary'}
                      className="text-[10px] gap-1"
                    >
                      {trade.direction === 'Long'
                        ? <ArrowUpRight className="size-3" />
                        : <ArrowDownRight className="size-3" />}
                      {trade.direction}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                    x{trade.quantity}
                  </Badge>
                </div>
              </div>

              {/* P/L display */}
              <div className="flex items-baseline gap-3">
                <span className={`text-3xl font-mono font-bold tracking-tight ${
                  isWin ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {isWin ? '+' : ''}{trade.net_pnl < 0 ? '-' : ''}${Math.abs(trade.net_pnl).toFixed(2)}
                </span>
                {trade.pnl_percent != null && (
                  <span className={`text-sm font-mono ${
                    isWin ? 'text-green-600/70 dark:text-green-400/70' : 'text-red-600/70 dark:text-red-400/70'
                  }`}>
                    {trade.pnl_percent >= 0 ? '+' : ''}{trade.pnl_percent.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Quick stats row */}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                {trade.entry_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatTime(trade.entry_time)} {'>'} {formatTime(trade.exit_time)}
                  </span>
                )}
                {trade.hold_time_minutes != null && (
                  <span className="font-mono">{formatHoldTime(trade.hold_time_minutes)}</span>
                )}
                {trade.commission_total != null && (
                  <span className="font-mono">-${trade.commission_total.toFixed(2)} comm</span>
                )}
              </div>
            </div>

            {/* ── Trade Data Grid (read-only display) ── */}
            <div className="px-6 py-4 border-b">
              <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                <StatCell label="Entry" value={`$${trade.entry_price.toFixed(2)}`} mono />
                <StatCell label="Exit" value={`$${trade.exit_price.toFixed(2)}`} mono />
                <StatCell label="Gross P/L" value={`$${trade.gross_pnl.toFixed(2)}`} mono />
                <StatCell label="Net P/L" value={`$${trade.net_pnl.toFixed(2)}`} mono />
                {trade.entry_amount != null && (
                  <StatCell label="Cost" value={`$${trade.entry_amount.toFixed(2)}`} mono />
                )}
                {trade.exit_amount != null && (
                  <StatCell label="Proceeds" value={`$${trade.exit_amount.toFixed(2)}`} mono />
                )}
                <StatCell label="Entry Time" value={formatTime(trade.entry_time)} mono />
                <StatCell label="Exit Time" value={formatTime(trade.exit_time)} mono />
                <StatCell label="Hold Time" value={formatHoldTime(trade.hold_time_minutes)} mono />
              </div>
            </div>

            {/* ── Review Section (editable) ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Grade Picker */}
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                  Grade
                </Label>
                <div className="flex gap-1.5">
                  {GRADES.map((g) => {
                    const isSelected = form.grade === g;
                    const gradeColors: Record<string, string> = {
                      A: 'bg-green-600 text-white border-green-600',
                      B: 'bg-green-600/70 text-white border-green-600/70',
                      C: 'bg-amber-500 text-white border-amber-500',
                      D: 'bg-orange-500 text-white border-orange-500',
                      F: 'bg-red-600 text-white border-red-600',
                    };
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => updateField('grade', isSelected ? '' : g)}
                        className={`w-9 h-9 rounded-md border text-sm font-semibold transition-all ${
                          isSelected
                            ? gradeColors[g]
                            : 'border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Setup + Context Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Setup</Label>
                  <Select value={form.setup_type as string} onValueChange={(v) => updateField('setup_type', v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Select setup" /></SelectTrigger>
                    <SelectContent>
                      {SETUP_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Mistake</Label>
                  <Select value={form.mistake_type as string} onValueChange={(v) => updateField('mistake_type', v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {MISTAKE_TYPES.map((m) => (
                        <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Market + Time Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Market</Label>
                  <Select value={form.market_regime as string} onValueChange={(v) => updateField('market_regime', v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Regime" /></SelectTrigger>
                    <SelectContent>
                      {MARKET_REGIMES.map((r) => (
                        <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Session</Label>
                  <Select value={form.time_of_day as string} onValueChange={(v) => updateField('time_of_day', v)}>
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Time" /></SelectTrigger>
                    <SelectContent>
                      {TIME_OF_DAY.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Conviction</Label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const filled = parseInt(form.conviction_level as string || '0') >= n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => updateField('conviction_level', form.conviction_level === n.toString() ? '' : n.toString())}
                          className={`flex-1 h-9 rounded-md border text-xs font-medium transition-all ${
                            filled
                              ? 'bg-foreground text-background border-foreground'
                              : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Followed Plan */}
              <div className="flex items-center gap-2.5 py-1">
                <Checkbox
                  id="followed_plan"
                  checked={form.followed_plan as boolean}
                  onCheckedChange={(v) => updateField('followed_plan', v === true)}
                />
                <Label htmlFor="followed_plan" className="text-sm cursor-pointer">
                  Followed trading plan
                </Label>
                {form.followed_plan && (
                  <TrendingUp className="size-3.5 text-green-600 ml-auto" />
                )}
                {form.followed_plan === false && form.mistake_type && (
                  <TrendingDown className="size-3.5 text-red-500 ml-auto" />
                )}
              </div>

              {/* Lesson */}
              <div className="space-y-1.5">
                <Label htmlFor="lesson" className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Lesson Learned
                </Label>
                <Input
                  id="lesson"
                  value={form.lesson as string}
                  onChange={(e) => updateField('lesson', e.target.value)}
                  placeholder="What did this trade teach you?"
                  className="h-9"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  value={form.notes as string}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Context, observations, screenshots..."
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label htmlFor="tags" className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Tags
                </Label>
                <Input
                  id="tags"
                  value={form.tags as string}
                  onChange={(e) => updateField('tags', e.target.value)}
                  placeholder="earnings, high-volume, gap-up..."
                  className="h-9"
                />
              </div>
            </div>

            {/* ── Footer ── */}
            <SheetFooter className="px-6 py-4 border-t bg-muted/30 flex-row justify-end gap-2">
              <Button variant="ghost" onClick={onClose} className="px-4">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || loading} className="px-6">
                {saving ? 'Saving...' : 'Save Review'}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
