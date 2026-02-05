# Trade Analytics Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add analytics views to identify patterns in losing trades — by time, by symbol, and detailed loss analysis.

**Architecture:** Extend existing SQLite views → add query functions to db.ts → create API routes → add UI tabs with tables and charts. No new dependencies needed — uses existing Recharts and shadcn/ui.

**Tech Stack:** Next.js 16, React 19, TypeScript, better-sqlite3, Recharts, shadcn/ui (Card, Table, Badge, Tabs)

---

## Task 1: Add SQL Views for Analytics

**Files:**
- Modify: `src/schema.sql:269` (after existing views, before indexes)

**Step 1: Add the new SQL views**

Add these views to `src/schema.sql` before the INDEXES section:

```sql
-- Losses with time breakdown (for pattern detection)
CREATE VIEW IF NOT EXISTS v_losses_detail AS
SELECT
  id,
  date,
  underlying,
  entry_time,
  exit_time,
  hold_time_minutes,
  net_pnl,
  CASE CAST(strftime('%w', date) AS INTEGER)
    WHEN 0 THEN 'Sunday'
    WHEN 1 THEN 'Monday'
    WHEN 2 THEN 'Tuesday'
    WHEN 3 THEN 'Wednesday'
    WHEN 4 THEN 'Thursday'
    WHEN 5 THEN 'Friday'
    WHEN 6 THEN 'Saturday'
  END as day_of_week,
  CAST(strftime('%w', date) AS INTEGER) as day_of_week_num,
  CAST(strftime('%H', entry_time) AS INTEGER) as entry_hour
FROM round_trips
WHERE net_pnl < 0
ORDER BY net_pnl ASC;

-- Performance by hour of day
CREATE VIEW IF NOT EXISTS v_performance_by_hour AS
SELECT
  CAST(strftime('%H', entry_time) AS INTEGER) as hour,
  COUNT(*) as trade_count,
  SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as winners,
  SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) as losers,
  ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
  ROUND(SUM(net_pnl), 2) as total_pnl,
  ROUND(AVG(net_pnl), 2) as avg_pnl
FROM round_trips
WHERE entry_time IS NOT NULL
GROUP BY hour
ORDER BY hour;

-- Performance by trading session
CREATE VIEW IF NOT EXISTS v_performance_by_session AS
SELECT
  CASE
    WHEN CAST(strftime('%H', entry_time) AS INTEGER) < 11
      OR (CAST(strftime('%H', entry_time) AS INTEGER) = 11 AND CAST(strftime('%M', entry_time) AS INTEGER) = 0)
    THEN 'open'
    WHEN CAST(strftime('%H', entry_time) AS INTEGER) < 14 THEN 'midday'
    ELSE 'close'
  END as session,
  COUNT(*) as trade_count,
  SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as winners,
  SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) as losers,
  ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
  ROUND(SUM(net_pnl), 2) as total_pnl,
  ROUND(AVG(net_pnl), 2) as avg_pnl
FROM round_trips
WHERE entry_time IS NOT NULL
GROUP BY session;

-- Performance by underlying symbol
CREATE VIEW IF NOT EXISTS v_performance_by_underlying AS
SELECT
  underlying,
  COUNT(*) as trade_count,
  SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as winners,
  SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) as losers,
  ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
  ROUND(SUM(net_pnl), 2) as total_pnl,
  ROUND(AVG(net_pnl), 2) as avg_pnl,
  ROUND(MAX(net_pnl), 2) as largest_win,
  ROUND(MIN(net_pnl), 2) as largest_loss
FROM round_trips
GROUP BY underlying
ORDER BY total_pnl DESC;

-- Loss patterns aggregated by hour
CREATE VIEW IF NOT EXISTS v_loss_patterns_by_hour AS
SELECT
  entry_hour as hour,
  COUNT(*) as loss_count,
  ROUND(SUM(net_pnl), 2) as total_loss
FROM v_losses_detail
WHERE entry_hour IS NOT NULL
GROUP BY entry_hour
ORDER BY total_loss ASC;

-- Loss patterns aggregated by day of week
CREATE VIEW IF NOT EXISTS v_loss_patterns_by_day AS
SELECT
  day_of_week,
  day_of_week_num,
  COUNT(*) as loss_count,
  ROUND(SUM(net_pnl), 2) as total_loss
FROM v_losses_detail
GROUP BY day_of_week_num
ORDER BY total_loss ASC;

-- Hold time comparison: winners vs losers
CREATE VIEW IF NOT EXISTS v_hold_time_comparison AS
SELECT
  'winners' as category,
  ROUND(AVG(hold_time_minutes), 1) as avg_hold_time,
  COUNT(*) as trade_count
FROM round_trips
WHERE net_pnl > 0 AND hold_time_minutes IS NOT NULL
UNION ALL
SELECT
  'losers' as category,
  ROUND(AVG(hold_time_minutes), 1) as avg_hold_time,
  COUNT(*) as trade_count
FROM round_trips
WHERE net_pnl < 0 AND hold_time_minutes IS NOT NULL;
```

**Step 2: Verify syntax**

Run: `sqlite3 data/journal.db < src/schema.sql`
Expected: No errors (views are CREATE IF NOT EXISTS)

**Step 3: Test views work**

Run: `sqlite3 data/journal.db "SELECT * FROM v_performance_by_hour LIMIT 5;"`
Expected: Returns rows or empty (if no data with entry_time)

**Step 4: Commit**

```bash
git add src/schema.sql
git commit -m "feat: add SQL views for trade analytics

- v_losses_detail: losing trades with time breakdown
- v_performance_by_hour: P/L by hour of day
- v_performance_by_session: open/midday/close breakdown
- v_performance_by_underlying: symbol performance
- v_loss_patterns_by_hour/day: aggregate loss patterns
- v_hold_time_comparison: winners vs losers hold time"
```

---

## Task 2: Add TypeScript Interfaces and Query Functions

**Files:**
- Modify: `frontend/src/lib/db.ts`

**Step 1: Add TypeScript interfaces**

Add after the existing `EquityPoint` interface (around line 81):

```typescript
export interface LossDetail {
  id: number;
  date: string;
  underlying: string;
  entry_time: string | null;
  exit_time: string | null;
  hold_time_minutes: number | null;
  net_pnl: number;
  day_of_week: string;
  day_of_week_num: number;
  entry_hour: number | null;
}

export interface HourlyPerformance {
  hour: number;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

export interface SessionPerformance {
  session: 'open' | 'midday' | 'close';
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

export interface UnderlyingPerformance {
  underlying: string;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  largest_win: number;
  largest_loss: number;
}

export interface LossPattern {
  hour?: number;
  day_of_week?: string;
  day_of_week_num?: number;
  loss_count: number;
  total_loss: number;
}

export interface HoldTimeComparison {
  category: 'winners' | 'losers';
  avg_hold_time: number;
  trade_count: number;
}
```

**Step 2: Add query functions**

Add after the existing `getWeekdayPerformance` function (at end of file):

```typescript
export function getBiggestLosses(limit: number = 20): LossDetail[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM v_losses_detail LIMIT ?
  `).all(limit) as LossDetail[];
}

export function getHourlyPerformance(): HourlyPerformance[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM v_performance_by_hour
  `).all() as HourlyPerformance[];
}

export function getSessionPerformance(): SessionPerformance[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM v_performance_by_session
  `).all() as SessionPerformance[];
}

export function getUnderlyingPerformance(): UnderlyingPerformance[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM v_performance_by_underlying
  `).all() as UnderlyingPerformance[];
}

export function getLossPatternsByHour(): LossPattern[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM v_loss_patterns_by_hour
  `).all() as LossPattern[];
}

export function getLossPatternsByDay(): LossPattern[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM v_loss_patterns_by_day
  `).all() as LossPattern[];
}

export function getHoldTimeComparison(): HoldTimeComparison[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM v_hold_time_comparison
  `).all() as HoldTimeComparison[];
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/lib/db.ts
git commit -m "feat: add query functions for trade analytics

- getBiggestLosses: top N losing trades with details
- getHourlyPerformance: P/L by hour
- getSessionPerformance: open/midday/close breakdown
- getUnderlyingPerformance: performance by symbol
- getLossPatternsByHour/Day: aggregate loss patterns
- getHoldTimeComparison: hold time winners vs losers"
```

---

## Task 3: Create API Routes

**Files:**
- Create: `frontend/src/app/api/losses/route.ts`
- Create: `frontend/src/app/api/time-performance/route.ts`
- Create: `frontend/src/app/api/symbol-performance/route.ts`

**Step 1: Create losses API route**

Create `frontend/src/app/api/losses/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import {
  getBiggestLosses,
  getLossPatternsByHour,
  getLossPatternsByDay,
  getHoldTimeComparison,
} from '@/lib/db';

export async function GET() {
  try {
    const losses = getBiggestLosses(20);
    const byHour = getLossPatternsByHour();
    const byDay = getLossPatternsByDay();
    const holdTime = getHoldTimeComparison();

    // Find worst hour and worst day
    const worstHour = byHour.length > 0 ? byHour[0] : null;
    const worstDay = byDay.length > 0 ? byDay[0] : null;

    return NextResponse.json({
      losses,
      patterns: {
        byHour,
        byDay,
        holdTime,
        worstHour,
        worstDay,
      },
    });
  } catch (error) {
    console.error('Error fetching losses:', error);
    return NextResponse.json({ error: 'Failed to fetch losses' }, { status: 500 });
  }
}
```

**Step 2: Create time-performance API route**

Create `frontend/src/app/api/time-performance/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getHourlyPerformance, getSessionPerformance } from '@/lib/db';

export async function GET() {
  try {
    const hourly = getHourlyPerformance();
    const sessions = getSessionPerformance();

    // Calculate insight: best cutoff time
    let bestCutoff = null;
    if (hourly.length > 0) {
      // Find hour after which cumulative P/L starts declining
      let cumulativePnl = 0;
      let maxPnl = 0;
      let bestHour = 9;

      for (const h of hourly) {
        cumulativePnl += h.total_pnl;
        if (cumulativePnl > maxPnl) {
          maxPnl = cumulativePnl;
          bestHour = h.hour;
        }
      }

      // Calculate how much would be saved by stopping at bestHour
      const afterBestHour = hourly
        .filter(h => h.hour > bestHour)
        .reduce((sum, h) => sum + h.total_pnl, 0);

      if (afterBestHour < 0) {
        bestCutoff = {
          hour: bestHour,
          savedAmount: Math.abs(afterBestHour),
        };
      }
    }

    return NextResponse.json({
      hourly,
      sessions,
      insight: bestCutoff,
    });
  } catch (error) {
    console.error('Error fetching time performance:', error);
    return NextResponse.json({ error: 'Failed to fetch time performance' }, { status: 500 });
  }
}
```

**Step 3: Create symbol-performance API route**

Create `frontend/src/app/api/symbol-performance/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getUnderlyingPerformance } from '@/lib/db';

export async function GET() {
  try {
    const symbols = getUnderlyingPerformance();

    // Find best and worst
    const bestSymbol = symbols.length > 0 ? symbols[0] : null;
    const worstSymbol = symbols.length > 0 ? symbols[symbols.length - 1] : null;

    // Calculate focus vs avoid totals
    const profitable = symbols.filter(s => s.total_pnl > 0);
    const unprofitable = symbols.filter(s => s.total_pnl < 0);

    return NextResponse.json({
      symbols,
      insights: {
        bestSymbol,
        worstSymbol,
        profitableTotal: profitable.reduce((sum, s) => sum + s.total_pnl, 0),
        unprofitableTotal: unprofitable.reduce((sum, s) => sum + s.total_pnl, 0),
        focusOn: profitable.slice(0, 3).map(s => s.underlying),
        avoid: unprofitable.slice(-3).map(s => s.underlying),
      },
    });
  } catch (error) {
    console.error('Error fetching symbol performance:', error);
    return NextResponse.json({ error: 'Failed to fetch symbol performance' }, { status: 500 });
  }
}
```

**Step 4: Verify API routes work**

Run: `cd frontend && pnpm dev`
Then in another terminal: `curl http://localhost:3001/api/losses | jq .`
Expected: Returns JSON with losses array and patterns object

**Step 5: Commit**

```bash
git add frontend/src/app/api/losses/route.ts \
        frontend/src/app/api/time-performance/route.ts \
        frontend/src/app/api/symbol-performance/route.ts
git commit -m "feat: add API routes for trade analytics

- /api/losses: biggest losers + pattern detection
- /api/time-performance: hourly + session breakdown with insight
- /api/symbol-performance: by underlying with recommendations"
```

---

## Task 4: Build Losses Tab UI

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Add interfaces for losses data**

Add after the existing `EquityPoint` interface (around line 65):

```typescript
interface LossDetail {
  id: number;
  date: string;
  underlying: string;
  entry_time: string | null;
  hold_time_minutes: number | null;
  net_pnl: number;
  day_of_week: string;
  entry_hour: number | null;
}

interface LossPatterns {
  byHour: { hour: number; loss_count: number; total_loss: number }[];
  byDay: { day_of_week: string; loss_count: number; total_loss: number }[];
  holdTime: { category: string; avg_hold_time: number; trade_count: number }[];
  worstHour: { hour: number; total_loss: number } | null;
  worstDay: { day_of_week: string; total_loss: number } | null;
}

interface LossesData {
  losses: LossDetail[];
  patterns: LossPatterns;
}
```

**Step 2: Add state for losses**

Add after the existing state declarations (around line 87):

```typescript
const [lossesData, setLossesData] = useState<LossesData | null>(null);
```

**Step 3: Fetch losses data**

Add to the `fetchData` function, after the existing Promise.all:

```typescript
const lossesRes = await fetch('/api/losses');
const lossesJson = await lossesRes.json();
setLossesData(lossesJson);
```

Update the Promise.all to include it:

```typescript
const [tradesRes, statsRes, setupsRes, equityRes, lossesRes] = await Promise.all([
  fetch('/api/trades'),
  fetch('/api/stats'),
  fetch('/api/setups'),
  fetch('/api/equity'),
  fetch('/api/losses'),
]);

const tradesData = await tradesRes.json();
const statsData = await statsRes.json();
const setupsData = await setupsRes.json();
const equityData = await equityRes.json();
const lossesJson = await lossesRes.json();

setTrades(tradesData.trades || []);
setSummaries(tradesData.summaries || []);
setStats(statsData.stats);
setSetups(setupsData.setups || []);
setEquity(equityData.equity || []);
setLossesData(lossesJson);
```

**Step 4: Add Losses tab trigger**

Update the TabsList (around line 178):

```typescript
<TabsList>
  <TabsTrigger value="overview">Overview</TabsTrigger>
  <TabsTrigger value="losses">Losses</TabsTrigger>
  <TabsTrigger value="trades">Trades</TabsTrigger>
  <TabsTrigger value="setups">Setups</TabsTrigger>
  <TabsTrigger value="calendar">Calendar</TabsTrigger>
</TabsList>
```

**Step 5: Add Losses tab content**

Add after the Overview TabsContent (before Trades TabsContent):

```typescript
{/* Losses Tab */}
<TabsContent value="losses" className="space-y-4">
  {/* Pattern Detection Cards */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>Worst Time</CardDescription>
        <CardTitle className="text-xl text-red-600">
          {lossesData?.patterns.worstHour
            ? `${lossesData.patterns.worstHour.hour}:00`
            : 'N/A'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {lossesData?.patterns.worstHour
            ? `$${lossesData.patterns.worstHour.total_loss.toFixed(2)} total losses`
            : 'No time data available'}
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardDescription>Worst Day</CardDescription>
        <CardTitle className="text-xl text-red-600">
          {lossesData?.patterns.worstDay?.day_of_week || 'N/A'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {lossesData?.patterns.worstDay
            ? `$${lossesData.patterns.worstDay.total_loss.toFixed(2)} total losses`
            : 'No day data available'}
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardDescription>Hold Time</CardDescription>
        <CardTitle className="text-xl">
          {lossesData?.patterns.holdTime.find(h => h.category === 'losers')?.avg_hold_time || 0} min
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Losers avg vs{' '}
          {lossesData?.patterns.holdTime.find(h => h.category === 'winners')?.avg_hold_time || 0} min winners
        </p>
        {lossesData?.patterns.holdTime &&
         (lossesData.patterns.holdTime.find(h => h.category === 'losers')?.avg_hold_time || 0) >
         (lossesData.patterns.holdTime.find(h => h.category === 'winners')?.avg_hold_time || 0) && (
          <Badge variant="destructive" className="mt-2">Holding losers too long</Badge>
        )}
      </CardContent>
    </Card>
  </div>

  {/* Biggest Losers Table */}
  <Card>
    <CardHeader>
      <CardTitle>Biggest Losers</CardTitle>
      <CardDescription>Your worst trades - find the patterns</CardDescription>
    </CardHeader>
    <CardContent>
      {lossesData && lossesData.losses.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Entry Time</TableHead>
              <TableHead>Hold Time</TableHead>
              <TableHead>Day</TableHead>
              <TableHead className="text-right">P/L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lossesData.losses.map((loss) => (
              <TableRow key={loss.id}>
                <TableCell>{loss.date}</TableCell>
                <TableCell className="font-medium">{loss.underlying}</TableCell>
                <TableCell>{loss.entry_time || '—'}</TableCell>
                <TableCell>
                  {loss.hold_time_minutes ? `${loss.hold_time_minutes} min` : '—'}
                </TableCell>
                <TableCell>{loss.day_of_week}</TableCell>
                <TableCell className="text-right text-red-600 font-medium">
                  ${loss.net_pnl.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-center py-8">No losing trades found</p>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

**Step 6: Verify UI renders**

Run: `cd frontend && pnpm dev`
Open: http://localhost:3001
Click: "Losses" tab
Expected: See pattern cards and losses table (may be empty if no data)

**Step 7: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add Losses tab with pattern detection

- Pattern cards: worst time, worst day, hold time comparison
- Biggest losers table with date, symbol, time, hold time, day
- Warning badge when holding losers too long"
```

---

## Task 5: Build Time Performance Tab UI

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Add interfaces for time data**

Add after the LossesData interface:

```typescript
interface HourlyPerformance {
  hour: number;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

interface SessionPerformance {
  session: string;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

interface TimeData {
  hourly: HourlyPerformance[];
  sessions: SessionPerformance[];
  insight: { hour: number; savedAmount: number } | null;
}
```

**Step 2: Add state and fetch for time data**

Add state:

```typescript
const [timeData, setTimeData] = useState<TimeData | null>(null);
```

Add to Promise.all:

```typescript
const [tradesRes, statsRes, setupsRes, equityRes, lossesRes, timeRes] = await Promise.all([
  fetch('/api/trades'),
  fetch('/api/stats'),
  fetch('/api/setups'),
  fetch('/api/equity'),
  fetch('/api/losses'),
  fetch('/api/time-performance'),
]);
// ... existing processing ...
const timeJson = await timeRes.json();
setTimeData(timeJson);
```

**Step 3: Add chart config for hourly P/L**

Add after existing chart configs:

```typescript
const hourlyChartConfig = {
  total_pnl: {
    label: "P/L",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;
```

**Step 4: Add Time tab trigger**

Update TabsList:

```typescript
<TabsList>
  <TabsTrigger value="overview">Overview</TabsTrigger>
  <TabsTrigger value="losses">Losses</TabsTrigger>
  <TabsTrigger value="time">Time</TabsTrigger>
  <TabsTrigger value="trades">Trades</TabsTrigger>
  <TabsTrigger value="setups">Setups</TabsTrigger>
  <TabsTrigger value="calendar">Calendar</TabsTrigger>
</TabsList>
```

**Step 5: Add Time tab content**

Add after Losses TabsContent:

```typescript
{/* Time Tab */}
<TabsContent value="time" className="space-y-4">
  {/* Insight Banner */}
  {timeData?.insight && (
    <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="pt-6">
        <p className="text-amber-800 dark:text-amber-200">
          💡 If you stopped trading at {timeData.insight.hour}:00, you'd be{' '}
          <strong>${timeData.insight.savedAmount.toFixed(2)}</strong> more profitable.
        </p>
      </CardContent>
    </Card>
  )}

  {/* Session Breakdown Cards */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {['open', 'midday', 'close'].map((sessionName) => {
      const session = timeData?.sessions.find(s => s.session === sessionName);
      const isProfit = session && session.total_pnl > 0;
      const isLoss = session && session.total_pnl < 0;
      return (
        <Card key={sessionName}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              {sessionName === 'open' && '🌅'}
              {sessionName === 'midday' && '🌤️'}
              {sessionName === 'close' && '🌆'}
              {sessionName.charAt(0).toUpperCase() + sessionName.slice(1)}
              <span className="text-xs text-muted-foreground">
                {sessionName === 'open' && '(9:30-11:00)'}
                {sessionName === 'midday' && '(11:00-2:00)'}
                {sessionName === 'close' && '(2:00-4:00)'}
              </span>
            </CardDescription>
            <CardTitle className={`text-2xl ${isProfit ? 'text-green-600' : isLoss ? 'text-red-600' : ''}`}>
              ${session?.total_pnl.toFixed(2) || '0.00'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Win Rate: {session?.win_rate || 0}%</p>
              <p>Trades: {session?.trade_count || 0}</p>
            </div>
            {isProfit && <Badge className="mt-2 bg-green-600">Your edge</Badge>}
            {isLoss && <Badge variant="destructive" className="mt-2">Stop trading</Badge>}
          </CardContent>
        </Card>
      );
    })}
  </div>

  {/* Hourly P/L Chart */}
  <Card>
    <CardHeader>
      <CardTitle>P/L by Hour</CardTitle>
      <CardDescription>When are you making and losing money?</CardDescription>
    </CardHeader>
    <CardContent>
      {timeData && timeData.hourly.length > 0 ? (
        <ChartContainer config={hourlyChartConfig} className="h-[300px] w-full">
          <BarChart data={timeData.hourly} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" tickFormatter={(v) => `${v}:00`} />
            <YAxis tickFormatter={(v) => `$${v}`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="total_pnl" radius={4}>
              {timeData.hourly.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.total_pnl >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="text-muted-foreground text-center py-8">
          No hourly data available. Trades need entry_time to analyze.
        </p>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

**Step 6: Verify UI renders**

Run: `cd frontend && pnpm dev`
Open: http://localhost:3001
Click: "Time" tab
Expected: See insight banner (if applicable), session cards, hourly chart

**Step 7: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add Time tab with session breakdown and hourly chart

- Insight banner: shows optimal cutoff time
- Session cards: open/midday/close with P/L and win rate
- Hourly P/L bar chart with green/red coloring"
```

---

## Task 6: Build Symbol Performance Tab UI

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Add interfaces for symbol data**

Add after TimeData interface:

```typescript
interface UnderlyingPerformance {
  underlying: string;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  largest_win: number;
  largest_loss: number;
}

interface SymbolData {
  symbols: UnderlyingPerformance[];
  insights: {
    bestSymbol: UnderlyingPerformance | null;
    worstSymbol: UnderlyingPerformance | null;
    profitableTotal: number;
    unprofitableTotal: number;
    focusOn: string[];
    avoid: string[];
  };
}
```

**Step 2: Add state and fetch for symbol data**

Add state:

```typescript
const [symbolData, setSymbolData] = useState<SymbolData | null>(null);
```

Add to Promise.all:

```typescript
const [tradesRes, statsRes, setupsRes, equityRes, lossesRes, timeRes, symbolRes] = await Promise.all([
  fetch('/api/trades'),
  fetch('/api/stats'),
  fetch('/api/setups'),
  fetch('/api/equity'),
  fetch('/api/losses'),
  fetch('/api/time-performance'),
  fetch('/api/symbol-performance'),
]);
// ... existing processing ...
const symbolJson = await symbolRes.json();
setSymbolData(symbolJson);
```

**Step 3: Add chart config for symbol P/L**

Add after hourlyChartConfig:

```typescript
const symbolChartConfig = {
  total_pnl: {
    label: "Total P/L",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;
```

**Step 4: Add Symbols tab trigger**

Update TabsList:

```typescript
<TabsList>
  <TabsTrigger value="overview">Overview</TabsTrigger>
  <TabsTrigger value="losses">Losses</TabsTrigger>
  <TabsTrigger value="time">Time</TabsTrigger>
  <TabsTrigger value="symbols">Symbols</TabsTrigger>
  <TabsTrigger value="trades">Trades</TabsTrigger>
  <TabsTrigger value="setups">Setups</TabsTrigger>
  <TabsTrigger value="calendar">Calendar</TabsTrigger>
</TabsList>
```

**Step 5: Add Symbols tab content**

Add after Time TabsContent:

```typescript
{/* Symbols Tab */}
<TabsContent value="symbols" className="space-y-4">
  {/* Recommendation Cards */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>🏆 Best Symbol</CardDescription>
        <CardTitle className="text-xl text-green-600">
          {symbolData?.insights.bestSymbol?.underlying || 'N/A'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {symbolData?.insights.bestSymbol && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>${symbolData.insights.bestSymbol.total_pnl.toFixed(2)} total</p>
            <p>{symbolData.insights.bestSymbol.trade_count} trades</p>
            <p>{symbolData.insights.bestSymbol.win_rate}% win rate</p>
          </div>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardDescription>💀 Worst Symbol</CardDescription>
        <CardTitle className="text-xl text-red-600">
          {symbolData?.insights.worstSymbol?.underlying || 'N/A'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {symbolData?.insights.worstSymbol && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>${symbolData.insights.worstSymbol.total_pnl.toFixed(2)} total</p>
            <p>{symbolData.insights.worstSymbol.trade_count} trades</p>
            <p>{symbolData.insights.worstSymbol.win_rate}% win rate</p>
          </div>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardDescription>📊 Recommendation</CardDescription>
        <CardTitle className="text-lg">
          Focus: {symbolData?.insights.focusOn.join(', ') || 'N/A'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Avoid: {symbolData?.insights.avoid.join(', ') || 'N/A'}
        </p>
        <Separator className="my-2" />
        <p className="text-sm">
          <span className="text-green-600">
            +${symbolData?.insights.profitableTotal.toFixed(2) || '0'}
          </span>
          {' vs '}
          <span className="text-red-600">
            ${symbolData?.insights.unprofitableTotal.toFixed(2) || '0'}
          </span>
        </p>
      </CardContent>
    </Card>
  </div>

  {/* Symbol P/L Chart */}
  <Card>
    <CardHeader>
      <CardTitle>P/L by Symbol</CardTitle>
      <CardDescription>Which underlyings are you profitable on?</CardDescription>
    </CardHeader>
    <CardContent>
      {symbolData && symbolData.symbols.length > 0 ? (
        <ChartContainer config={symbolChartConfig} className="h-[300px] w-full">
          <BarChart
            data={symbolData.symbols}
            layout="horizontal"
            margin={{ top: 10, right: 30, left: 60, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="underlying" />
            <YAxis tickFormatter={(v) => `$${v}`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="total_pnl" radius={4}>
              {symbolData.symbols.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.total_pnl >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="text-muted-foreground text-center py-8">No symbol data available</p>
      )}
    </CardContent>
  </Card>

  {/* Performance Table */}
  <Card>
    <CardHeader>
      <CardTitle>Performance by Symbol</CardTitle>
      <CardDescription>Detailed breakdown by underlying</CardDescription>
    </CardHeader>
    <CardContent>
      {symbolData && symbolData.symbols.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Winners</TableHead>
              <TableHead className="text-right">Win Rate</TableHead>
              <TableHead className="text-right">Total P/L</TableHead>
              <TableHead className="text-right">Avg P/L</TableHead>
              <TableHead className="text-right">Best</TableHead>
              <TableHead className="text-right">Worst</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {symbolData.symbols.map((symbol) => (
              <TableRow key={symbol.underlying}>
                <TableCell className="font-medium">{symbol.underlying}</TableCell>
                <TableCell className="text-right">{symbol.trade_count}</TableCell>
                <TableCell className="text-right">{symbol.winners}</TableCell>
                <TableCell className="text-right">{symbol.win_rate}%</TableCell>
                <TableCell className={`text-right font-medium ${symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${symbol.total_pnl.toFixed(2)}
                </TableCell>
                <TableCell className={`text-right ${symbol.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${symbol.avg_pnl.toFixed(2)}
                </TableCell>
                <TableCell className="text-right text-green-600">
                  ${symbol.largest_win.toFixed(2)}
                </TableCell>
                <TableCell className="text-right text-red-600">
                  ${symbol.largest_loss.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-center py-8">No symbol data available</p>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

**Step 6: Verify UI renders**

Run: `cd frontend && pnpm dev`
Open: http://localhost:3001
Click: "Symbols" tab
Expected: See recommendation cards, P/L chart, and performance table

**Step 7: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add Symbols tab with performance breakdown

- Recommendation cards: best symbol, worst symbol, focus/avoid list
- P/L by symbol bar chart with green/red coloring
- Detailed performance table with all metrics"
```

---

## Task 7: Final Testing and Polish

**Files:**
- No new files

**Step 1: Verify all tabs work with real data**

Import test trades if not already done:
```bash
python src/journal.py import ~/Downloads/etrade_transactions.csv
```

**Step 2: Run production build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds with no errors

**Step 3: Test production build**

```bash
cd frontend && pnpm start
```

Open: http://localhost:3000
Test: Click through all tabs, verify data displays correctly

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: complete trade analytics feature

Adds pattern detection dashboard with:
- Losses tab: biggest losers, worst time/day patterns, hold time analysis
- Time tab: hourly P/L, session breakdown, optimal cutoff insight
- Symbols tab: performance by underlying, focus/avoid recommendations

Closes #1"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Add SQL views | `src/schema.sql` |
| 2 | Add TypeScript interfaces and queries | `frontend/src/lib/db.ts` |
| 3 | Create API routes | `frontend/src/app/api/{losses,time-performance,symbol-performance}/route.ts` |
| 4 | Build Losses tab | `frontend/src/app/page.tsx` |
| 5 | Build Time tab | `frontend/src/app/page.tsx` |
| 6 | Build Symbols tab | `frontend/src/app/page.tsx` |
| 7 | Final testing | — |

Total commits: 7
Estimated implementation: 7 tasks with TDD approach
