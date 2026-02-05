# Trade Analytics Dashboard Design

## Goal

Help identify patterns in losing trades to become consistently profitable and scale up.

## Problem Statement

- Making money at times but big losses wipe out profits
- Need to understand: what's causing losses, when they happen, and on what symbols
- Currently have gamma exposure edge for day trading options — need to validate it works

## User Research

Based on top trading journals ([Tradervue](https://www.tradervue.com/), [Edgewonk](https://edgewonk.com/), [TradeZella](https://www.tradezella.com/), [TradesViz](https://www.tradesviz.com/)):

- 600+ metrics with pattern detection
- Psychology and mistake tracking with cost analysis
- Performance breakdowns by time, symbol, setup, regime
- Actionable insights that surface what's costing money

## Design

### View 1: Losses Analysis

**Purpose:** Face the biggest losers and find common patterns.

**Components:**

1. **Biggest Losers Table**
   - Columns: Date, Underlying, Entry Time, Hold Time, P/L, Day of Week
   - Sorted by P/L ascending (worst first)
   - Limit to top 20 or configurable

2. **Pattern Detection Cards**
   - Worst Time: Hour with most losses + total $ lost
   - Worst Day: Day of week with most losses + total $ lost
   - Hold Time Comparison: Avg hold time for winners vs losers

3. **Loss Distribution Chart**
   - Bar chart: Losses by hour of day
   - Highlight "danger zone" hours in red

### View 2: Time-Based Performance

**Purpose:** Find profitable hours and money-losing hours.

**Components:**

1. **Hourly P/L Bar Chart**
   - X-axis: Trading hours (9:30 AM - 4:00 PM in 30-min or 1-hour buckets)
   - Y-axis: Total P/L
   - Color: Green for profit, red for loss

2. **Session Breakdown Cards**
   - Open (9:30-11:00): P/L, Win Rate, Trade Count
   - Midday (11:00-2:00): P/L, Win Rate, Trade Count
   - Close (2:00-4:00): P/L, Win Rate, Trade Count
   - Visual indicator: checkmark, neutral, or X based on profitability

3. **Insight Banner**
   - Calculate: "If you stopped trading at X, you'd be $Y more profitable"
   - Show most actionable time-based insight

### View 3: Symbol/Underlying Performance

**Purpose:** Focus on symbols where you have edge, avoid the rest.

**Components:**

1. **Performance Table**
   - Columns: Underlying, Trades, Winners, Win Rate, Total P/L, Avg P/L, Largest Win, Largest Loss
   - Sortable by any column
   - Color-code P/L cells (green/red)

2. **P/L by Symbol Bar Chart**
   - Horizontal bar chart
   - Sorted by P/L (best at top)
   - Green/red coloring

3. **Recommendation Cards**
   - Best Symbol: Top performer with stats
   - Worst Symbol: Biggest loser with stats
   - Recommendation: "Focus on X, Avoid Y"

## Technical Implementation

### Database Layer

New SQL views in `src/schema.sql`:

```sql
-- Losses with time breakdown
CREATE VIEW v_losses_detail AS
SELECT
  date,
  underlying,
  entry_time,
  exit_time,
  hold_time_minutes,
  net_pnl,
  CAST(strftime('%w', date) AS INTEGER) as day_of_week,
  CAST(strftime('%H', entry_time) AS INTEGER) as entry_hour
FROM round_trips
WHERE net_pnl < 0
ORDER BY net_pnl ASC;

-- Performance by hour
CREATE VIEW v_performance_by_hour AS
SELECT
  CAST(strftime('%H', entry_time) AS INTEGER) as hour,
  COUNT(*) as trade_count,
  SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as winners,
  ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
  SUM(net_pnl) as total_pnl,
  ROUND(AVG(net_pnl), 2) as avg_pnl
FROM round_trips
WHERE entry_time IS NOT NULL
GROUP BY hour
ORDER BY hour;

-- Performance by session
CREATE VIEW v_performance_by_session AS
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
  ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
  SUM(net_pnl) as total_pnl,
  ROUND(AVG(net_pnl), 2) as avg_pnl
FROM round_trips
WHERE entry_time IS NOT NULL
GROUP BY session;

-- Performance by underlying (enhanced)
CREATE VIEW v_performance_by_underlying AS
SELECT
  underlying,
  COUNT(*) as trade_count,
  SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as winners,
  SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) as losers,
  ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
  SUM(net_pnl) as total_pnl,
  ROUND(AVG(net_pnl), 2) as avg_pnl,
  MAX(net_pnl) as largest_win,
  MIN(net_pnl) as largest_loss
FROM round_trips
GROUP BY underlying
ORDER BY total_pnl DESC;
```

### API Routes

New Next.js API routes in `frontend/src/app/api/`:

| Route | Method | Returns |
|-------|--------|---------|
| `/api/losses` | GET | Top losing trades + pattern stats |
| `/api/time-performance` | GET | Hourly + session breakdown |
| `/api/symbol-performance` | GET | Performance by underlying |

### Frontend Components

New/modified files in `frontend/src/`:

| File | Purpose |
|------|---------|
| `app/page.tsx` | Add new tabs: Losses, Time, Symbols |
| `lib/db.ts` | Add query functions for new views |
| `components/ui/insight-card.tsx` | Reusable card for pattern insights |
| `components/charts/hourly-pnl.tsx` | Hourly P/L bar chart |
| `components/charts/symbol-pnl.tsx` | Symbol P/L horizontal bar chart |

### Data Flow

```
round_trips table
       ↓
SQL Views (v_losses_detail, v_performance_by_hour, etc.)
       ↓
API Routes (/api/losses, /api/time-performance, /api/symbol-performance)
       ↓
React Dashboard (new tabs with tables, charts, insight cards)
```

## Implementation Order

1. Add SQL views to schema.sql
2. Add query functions to db.ts
3. Create API routes
4. Build Losses tab (table + pattern cards)
5. Build Time Performance section (chart + session cards)
6. Build Symbol Performance section (table + chart + recommendations)
7. Add insight banners with actionable recommendations

## Future Enhancements (Phase 2)

After validating patterns from this analysis:

- Pre-trade logging (regime, conviction, plan)
- Post-trade grading (A-F, mistake type)
- Mistake cost tracking dashboard
- Daily loss limit warnings
- Gamma exposure setup tracking

## Success Criteria

- Can identify which hours are profitable vs losing money
- Can see which symbols to focus on vs avoid
- Can spot patterns in biggest losing trades
- Actionable insights that change behavior

## Sources

- [StockBrokers.com - Best Trading Journals 2026](https://www.stockbrokers.com/guides/best-trading-journals)
- [Tradervue](https://www.tradervue.com/)
- [Edgewonk Features](https://edgewonk.com/features)
- [TradeZella Playbooks](https://www.tradezella.com/playbooks)
- [TradesViz](https://www.tradesviz.com/)
