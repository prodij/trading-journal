# CSV Upload & Trade Editing — Design

## Summary

Add two capabilities to the web dashboard:
1. **CSV Upload** — drag-and-drop E*Trade CSV import via the UI (replaces CLI workflow)
2. **Trade Editing** — click any trade to edit all fields in a modal

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CSV import logic | Shell out to Python CLI | Reuses battle-tested parsing, FIFO matching, and summary calculation |
| Trade edit writes | Next.js direct SQLite writes | Simpler than building CLI commands for every field |
| DB connections | Read-only (existing) + read-write (new) | No risk to existing GET endpoints |
| UI pattern | Modal/drawer for editing, button for upload | Fits existing layout, no new pages |

## CSV Upload Flow

1. **Import button** in dashboard header area
2. User selects or drags an E*Trade `.csv` file
3. `POST /api/import` receives file as `multipart/form-data`
4. API route saves to temp file, runs `child_process.execFile('python3', ['src/journal.py', 'import', tempFilePath])`
5. Parses stdout for results (new trades count, duplicates skipped)
6. Cleans up temp file, returns result
7. Frontend shows success/error toast, refreshes trade list

**Duplicate handling:** Skip duplicates (INSERT OR IGNORE) — same as current CLI behavior.

## Trade Editing

### UI

- Trades tab rows become clickable (hover state, pointer cursor)
- Click opens a **TradeEditModal** (shadcn `Sheet` or `Dialog`)
- Fields organized in three sections:

**Trade Details (core):**
- date, underlying, expiration, strike, option_type, direction
- quantity, entry_price, exit_price, entry_amount, exit_amount
- entry_time, exit_time

**Review:**
- setup_type (dropdown: pullback, breakout, reversal, scalp, etc.)
- grade (A/B/C/D/F dropdown)
- conviction_level (1-5)
- followed_plan (checkbox)
- mistake_type (dropdown: early_entry, late_exit, fomo, revenge, etc.)
- lesson (text input)
- notes (textarea)

**Tags:**
- Comma-separated text input

### Save Flow

- Save sends `PATCH /api/trades/[id]` with changed fields only
- API opens read-write SQLite connection, runs `UPDATE round_trips SET ... WHERE id = ?`
- If price/amount fields changed, recalculates:
  - `gross_pnl = exit_amount - entry_amount`
  - `net_pnl = gross_pnl - commission_total`
  - `pnl_percent = (net_pnl / abs(entry_amount)) * 100`
  - `hold_time_minutes` if entry_time/exit_time changed
- Returns updated trade; frontend refreshes

### Validation

- Required: date, underlying, quantity, entry_price, exit_price
- Numeric validation on prices/amounts
- setup_type and mistake_type constrained to known values via dropdowns

## New API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/import` | Accept CSV, shell out to Python CLI |
| `PATCH` | `/api/trades/[id]` | Update fields on a round_trip |
| `GET` | `/api/trades/[id]` | Get single trade for edit modal |

## Database Changes

In `frontend/src/lib/db.ts`:
- Keep existing read-only connection for all GET queries
- Add read-write connection for PATCH/POST write operations
- Both point to `data/journal.db`

## Frontend Components

| Component | Description |
|-----------|-------------|
| `ImportButton` | Upload button in header, file picker, progress/result toast |
| `TradeEditModal` | Full edit form in Sheet/Dialog, three field sections, save/cancel |
| Trades tab | Rows become clickable, open TradeEditModal on click |

## State Management

- Simple `fetch` + `useState` — no state library needed
- Re-fetch trades list after save or import
- No optimistic UI — SQLite writes are fast enough

## Files to Create/Modify

**New files:**
- `frontend/src/app/api/import/route.ts`
- `frontend/src/app/api/trades/[id]/route.ts`
- `frontend/src/components/ImportButton.tsx`
- `frontend/src/components/TradeEditModal.tsx`

**Modified files:**
- `frontend/src/lib/db.ts` — add read-write connection + write helpers
- `frontend/src/app/page.tsx` — add ImportButton to header, make trade rows clickable
