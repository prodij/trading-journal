# Trading Journal 📊

Personal trading journal with analytics to find edge and improve performance.

## Vision

Track every trade with context (setup type, market conditions, emotions) and analyze patterns to find:
- **What setups work best** for your style
- **What market conditions** you perform well/poorly in
- **What times of day** you're sharpest
- **What position sizes** optimize your P/L
- **What emotional states** lead to mistakes

## Features

### Current
- [x] E*TRADE CSV import
- [x] FIFO trade matching
- [x] P/L calculation with commissions
- [x] Daily summary stats
- [x] CLI interface

### Planned
- [ ] Web dashboard with charts
- [ ] Setup type tagging (pullback, breakout, reversal, scalp)
- [ ] Market regime tracking (trending, ranging, volatile)
- [ ] Time-of-day analysis
- [ ] Equity curve visualization
- [ ] Win rate by setup type
- [ ] Drawdown analysis
- [ ] Trade replay/review
- [ ] Screenshot attachment per trade
- [ ] Notes and lessons learned
- [ ] Weekly/monthly reports
- [ ] Export for tax prep

## Tech Stack

- **Database:** SQLite (local-first, portable)
- **Backend:** Python (import, analysis, API)
- **Frontend:** Next.js + Tailwind + shadcn/ui (planned)
- **Charts:** Recharts or Lightweight Charts

## Quick Start

```bash
# Import trades from E*TRADE
python src/journal.py import ~/Downloads/etrade_transactions.csv

# View today's summary
python src/journal.py today

# View stats for last 7 days
python src/journal.py stats

# View stats for last 30 days
python src/journal.py stats 30
```

## Schema

### Core Tables
- `executions` — Raw broker data (every buy/sell)
- `round_trips` — Matched trades with P/L
- `daily_summary` — Daily statistics

### Context Tables
- `setups` — Setup type definitions
- `market_conditions` — Daily market regime
- `trade_notes` — Per-trade notes and lessons
- `tags` — Flexible tagging system

## Data Flow

```
E*TRADE CSV → Import → Executions → FIFO Matching → Round Trips → Analytics
                                         ↓
                                   Daily Summary
                                         ↓
                                   Web Dashboard
```

## License

Private — Personal use only.
