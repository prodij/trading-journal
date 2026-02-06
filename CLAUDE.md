# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trading journal application for tracking, analyzing, and improving trading performance. Bun + Hono backend with Vite + React frontend, SQLite database.

**Architecture:**
```
E*TRADE CSV → Hono API (Bun) → bun:sqlite → SQLite
                                    ↓
                        Vite + React + shadcn/ui Dashboard
```

## Development Commands

```bash
cd app
bun install              # Install dependencies
bun run dev              # Vite dev server on http://localhost:4000
bun run dev:server       # Hono API server on http://localhost:3000
bun run build            # Production build (Vite)
bun run start            # Production server
```

Run both dev and dev:server together for local development. Vite proxies /api/* to the Hono server.

### Docker
```bash
docker-compose up --build   # Full stack on http://localhost:4000
```

## Key Files

| Purpose | Path |
|---------|------|
| Hono server entry | `app/src/server/index.ts` |
| Database layer | `app/src/server/db.ts` |
| Database schema | `app/schema.sql` |
| CSV import logic | `app/src/server/lib/import.ts` |
| DB query functions | `app/src/server/lib/queries.ts` |
| API routes | `app/src/server/routes/*.ts` |
| Dashboard UI | `app/src/client/App.tsx` |
| UI components | `app/src/client/components/` |
| Vite config | `app/vite.config.ts` |

## Data Flow

1. **Import**: Upload CSV via `/api/import` → parse E*TRADE format → `executions` table
2. **Match**: FIFO algorithm matches buys/sells → `round_trips` table with P/L
3. **Aggregate**: Daily stats calculated → `daily_summary` table
4. **Display**: React frontend fetches from Hono API routes

## Database

SQLite at `data/journal.db`. Key tables:
- `executions` - Raw broker orders
- `round_trips` - Matched trades with P/L and metadata
- `daily_summary` - Aggregated daily statistics

Pre-calculated views: `v_performance_by_setup`, `v_performance_by_time`, `v_performance_by_regime`, `v_performance_by_weekday`, `v_equity_curve`, `v_mistakes`, `v_losses_detail`, `v_performance_by_hour`, `v_performance_by_session`, `v_performance_by_underlying`, `v_loss_patterns_by_hour`, `v_loss_patterns_by_day`, `v_hold_time_comparison`

## Tech Stack

**Runtime**: Bun (built-in SQLite via bun:sqlite)
**API**: Hono
**Frontend**: Vite, React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui, Recharts
**Deploy**: Docker (oven/bun:1-alpine), GitHub Actions → GHCR, Coolify

## Code Patterns

- Single Bun process serves API + static frontend in production
- OCC options symbol parsing in `parseOccSymbol()` (e.g., `QQQ---260205C00609000`)
- Database auto-initializes schema on first connection
- Imports are idempotent via `INSERT OR IGNORE` with unique constraints
- Path alias: `@/*` → `app/src/client/*`
