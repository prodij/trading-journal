# Swing Trade Support — Multi-Day Position Matching

## Problem

The FIFO matcher in `import.ts` is date-scoped — it only matches buys and sells within the same trading day. Positions held across multiple days (buy Monday, sell Wednesday) sit unmatched with no round_trip or P/L calculated.

## Approach: Auto-Detect with Cross-Date FIFO

Match within the day first (existing behavior). Any leftover unmatched buys become open positions. When a sell comes in with no same-day buy match, consume from open positions using FIFO.

Day trades require zero changes from the user. Swing trades are detected automatically.

## Principles

- **Executions are the single source of truth.** `round_trips` and `open_positions` are both derived data, fully rebuildable at any time.
- **P/L realized on exit_date.** Daily summary reflects trades on the day they closed, matching broker reporting.
- **Idempotent recalculation.** Re-importing a CSV or triggering recalc produces the same results.

## Schema Changes

### New Table: `open_positions`

```sql
CREATE TABLE IF NOT EXISTS open_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    underlying TEXT NOT NULL,
    expiration DATE,
    strike REAL,
    option_type TEXT,
    direction TEXT DEFAULT 'Long',
    remaining_qty INTEGER NOT NULL,
    entry_price REAL NOT NULL,
    entry_amount_per REAL NOT NULL,
    commission_per REAL NOT NULL,
    entry_date DATE NOT NULL,
    entry_time TIME,
    source_execution_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Modified Table: `round_trips`

Replace single `date` column with `entry_date` and `exit_date`:

- Day trades: `entry_date = exit_date`
- Swing trades: different values
- `hold_time_minutes` populated only for same-day trades; multi-day holds use date difference

### Migration

SQLite requires table rebuild to remove `date` column:

1. Create `round_trips_new` with `entry_date` + `exit_date` (no `date`)
2. Copy data: `entry_date = date, exit_date = date`
3. Drop old table, rename new
4. Recreate indexes on `entry_date`, `exit_date`, `underlying`
5. Create `open_positions` table
6. Schema version check runs migration once on startup

## Matching Algorithm

Current: `calculateRoundTrips(db, tradeDate)` — per date.
New: `calculateRoundTrips(db, contractKey)` — per contract across all dates.

```
For each unique (underlying, expiration, strike, option_type):
  1. Load ALL buy executions ordered by (date ASC, id ASC) — FIFO
  2. Load ALL sell executions ordered by (date ASC, id ASC)
  3. Walk sells, consuming from buy queue:
     - matchQty = min(sellRemaining, buyRemaining)
     - Create round_trip: entry_date=buy.date, exit_date=sell.date
  4. Leftover buy remainder → INSERT into open_positions
```

### Recalculation

Triggered after CSV import. Scoped per-contract (not per-date):

1. Identify affected contracts from imported executions
2. DELETE all `round_trips` and `open_positions` for those contracts
3. Re-run full FIFO for each affected contract
4. Recalculate `daily_summary` for all affected dates

## Affected Views

All views referencing `round_trips.date` update to use `exit_date` (when P/L realized):

- `v_losses_detail`
- `v_wins_detail`
- `v_performance_by_weekday`
- `v_performance_by_hour` (uses `entry_time`, unaffected)
- `v_equity_curve` (uses `daily_summary`, unaffected)

## API Changes

- `GET /api/trades` — date filter matches on `exit_date`
- `GET /api/positions` — new endpoint, returns open positions
- Trade detail response includes `entry_date` and `exit_date`

## Frontend Changes

- Trades table: Date column shows `exit_date`; for swings where `entry_date != exit_date`, show both
- New "Open Positions" card/section showing current holdings with unrealized P/L

## Scenarios Handled

| Scenario | Result |
|----------|--------|
| Buy 3, sell 3 same day | 1-3 round_trips, entry_date = exit_date |
| Buy 3, sell 1 same day, sell 2 next day | 1 day trade + 1 swing round_trip, open_position intermediate |
| Buy 3 Mon, sell 3 Wed | 1 swing round_trip |
| Buy 3 Mon, buy 2 Tue, sell 5 Wed | 2 round_trips (3 from Mon buy, 2 from Tue buy), FIFO order |
| Buy 3, sell 1 Tue/Wed/Thu | 3 swing round_trips, scaling out |
| Re-import CSV | Delete + rebuild derived data, idempotent |
