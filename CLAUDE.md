# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trading journal application for tracking, analyzing, and improving trading performance. Combines a Python CLI backend for data import/processing with a Next.js dashboard for visualization.

**Architecture:**
```
E*TRADE CSV → Python CLI → SQLite → Next.js API Routes → React Dashboard
```

## Development Commands

### Frontend (Next.js)
```bash
cd frontend
pnpm install          # Install dependencies
pnpm dev -p 4000      # Dev server on http://localhost:4000
pnpm build            # Production build
pnpm lint             # ESLint
```

### Backend (Python CLI)
```bash
python src/journal.py import ~/Downloads/etrade.csv   # Import trades
python src/journal.py today                           # Today's trades
python src/journal.py stats [days]                    # N-day stats (default 7)
python src/journal.py setup <trade_id> <type>         # Tag trade setup
python src/journal.py note <trade_id> "note"          # Add note
python src/journal.py setups                          # Setup performance
python src/journal.py weekdays                        # Weekday performance
python src/journal.py equity                          # Equity curve
```

### Docker
```bash
docker-compose up --build   # Full stack on http://localhost:3000
```

## Key Files

| Purpose | Path |
|---------|------|
| CLI entry point | `src/journal.py` |
| Database schema | `src/schema.sql` |
| Dashboard UI | `frontend/src/app/page.tsx` |
| Database queries | `frontend/src/lib/db.ts` |
| API routes | `frontend/src/app/api/{trades,stats,setups,equity,losses,time-performance,symbol-performance}/route.ts` |

## Data Flow

1. **Import**: `journal.py import` parses E*TRADE CSV → `executions` table
2. **Match**: FIFO algorithm matches buys/sells → `round_trips` table with P/L
3. **Aggregate**: Daily stats calculated → `daily_summary` table
4. **Display**: Next.js reads SQLite directly via `better-sqlite3`

## Database

SQLite at `data/journal.db`. Key tables:
- `executions` - Raw broker orders
- `round_trips` - Matched trades with P/L and metadata (setup_type, notes, etc.)
- `daily_summary` - Aggregated daily statistics

Pre-calculated views: `v_performance_by_setup`, `v_performance_by_time`, `v_performance_by_regime`, `v_performance_by_weekday`, `v_equity_curve`, `v_mistakes`, `v_losses_detail`, `v_performance_by_hour`, `v_performance_by_session`, `v_performance_by_underlying`, `v_loss_patterns_by_hour`, `v_loss_patterns_by_day`, `v_hold_time_comparison`

## Tech Stack

**Frontend**: Next.js 16, React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui (new-york), Recharts, better-sqlite3

**Backend**: Python 3 (stdlib only - no deps), sqlite3

**Deploy**: Docker multi-stage build, GitHub Actions → GHCR, Coolify

## Code Patterns

- Python CLI uses pure stdlib (no external deps) for portability
- OCC options symbol parsing: `parse_occ_symbol()` handles E*TRADE format (e.g., `QQQ---260205C00609000`)
- Database auto-initializes schema on first connection
- Imports are idempotent via `INSERT OR IGNORE` with unique constraints
- Frontend uses server-side SQLite (read-only in API routes)
- Path alias: `@/*` → `frontend/src/*`
