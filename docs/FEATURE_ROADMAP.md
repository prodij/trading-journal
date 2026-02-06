# Trading Journal Feature Roadmap

## Vision
A lightweight, self-hosted trading journal for options day trading that focuses on **behavior change** — not just record-keeping. Every feature should answer: "Does this help me trade better tomorrow?"

## Current Capabilities
- E*Trade CSV import (idempotent, FIFO matching)
- Round-trip P/L calculation with commission tracking
- Daily summary with win rate, profit factor
- Analytics: by setup type, time of day, session, hour, symbol, weekday
- Loss pattern detection (worst hours, worst days, hold time comparison)
- Equity curve
- Trade editing (setup type, notes, mistake type, grade, etc.)
- Schema fields for psychology tracking (mood, energy, sleep, conviction)
- Schema fields for market context (regime, VIX, SPY/QQQ change)

---

## Phase 1: Surface What's Already There (Low effort, high impact)

### F1. Mistake Cost Dashboard
**Status:** Schema ready (`mistake_type` on `round_trips`, `v_mistakes` view exists)
**What:** Prominent card showing dollar cost per mistake type: "FOMO cost you $847 this month, revenge trading cost $423, early exits cost $312."
**Why:** Traders know they make mistakes intellectually. Seeing the dollar amount changes behavior. Most cited behavior-changing feature across Edgewonk reviews.
**Requires:** Frontend card + query. No schema changes.

### F2. Pre-Market Plan / Post-Market Review
**Status:** Schema ready (`pre_market_plan`, `post_market_review`, `mood_start`, `mood_end`, `energy_level`, `sleep_hours` on `daily_summary`)
**What:** Morning form: set bias, key levels, max loss, max trades, setups to look for. Evening form: what went right, what went wrong, key lesson. Show streak of completed reviews.
**Why:** Writing a plan and reviewing against it is the most cited practice among consistently profitable traders.
**Requires:** Frontend forms. No schema changes.

### F3. Unreviewed Trade Prompts
**Status:** Schema ready (many trades have NULL `setup_type`, `grade`, `mistake_type`)
**What:** Badge showing "12 trades need review." Quick-tag interface for batch reviewing. After CSV import, prompt to review new trades.
**Why:** If trades go untagged, all setup/mistake analysis is worthless. Reducing tagging friction is the highest-leverage UX improvement.
**Requires:** Frontend badge + batch tag UI. No schema changes.

---

## Phase 2: Behavior Detection (Medium effort, very high impact)

### F4. Tilt Detection / Consecutive Loss Tracking
**Status:** Not implemented
**What:** Track win/loss streaks within a day and across days. After 3 consecutive losses, flag subsequent trades. Show: "After your 3rd loss in a day, your next trades average -$X." Tiltmeter visualization.
**Why:** Revenge trading after losses is the #1 account killer for day traders. Automated detection with dollar quantification makes the invisible visible. Inspired by Edgewonk's Tiltmeter — their most praised feature.
**Requires:** New SQL view (`v_tilt_analysis`), frontend card/chart.

### F5. Playbook Rules Adherence
**Status:** Schema partially ready (`setup_types.rules`, `setup_types.avoid_conditions`, `round_trips.followed_plan`)
**What:** Define rules per setup type (e.g., "Breakout: only enter above VWAP, min 2:1 R/R"). Per trade, check which rules were followed. Show win rate for rule-following vs. rule-breaking trades.
**Why:** Separates execution quality from strategy quality. If your strategy works 70% when you follow rules but you only follow them 40% of the time, that's the real problem. Inspired by TradeZella's Playbook system.
**Requires:** Rules definition UI, per-trade checklist, comparison analytics.

### F6. Daily Max Loss Circuit Breaker
**Status:** Not implemented
**What:** Set daily max loss threshold. Track intraday cumulative P/L. Flag trades taken after hitting the limit. Show P/L of circuit-breaker-violation trades separately.
**Why:** A single bad day can erase a week of gains. Every prop firm enforces this. Building the habit in a personal journal is preparation for scaling up.
**Requires:** Settings table, new column or tag on round_trips, dashboard warning.

---

## Phase 3: Options-Specific Analytics (Medium effort, high impact)

### F7. DTE / Strike Distance Analytics
**Status:** Schema has `expiration`, `strike`, `option_type` — just needs calculation
**What:** Calculate DTE at entry from `date` and `expiration`. Calculate strike distance from underlying price (ATM vs OTM). Show P/L by DTE bucket (0DTE, 1-3DTE, 4+DTE), by strike distance, by call vs put.
**Why:** "I make money on 0DTE calls but lose on 1DTE puts" or "I'm profitable within 1% of ATM but lose on OTM" — this is options-specific edge discovery.
**Requires:** New SQL views, underlying price at entry (may need to derive or add column), frontend charts.

### F8. Rolling Expectancy & Profit Factor Trend
**Status:** Profit factor exists per day in `daily_summary`, but no trend visualization
**What:** Rolling 20-trade expectancy (avg_win * win_rate - avg_loss * loss_rate) and profit factor over time. Line chart showing whether edge is improving, stable, or degrading.
**Why:** A snapshot win rate is meaningless. The trend tells you if you're getting better or worse. Degrading expectancy despite positive P/L is an early warning of an impending drawdown.
**Requires:** Rolling window calculation (SQL or app-level), line chart.

---

## Phase 4: Advanced Features (Higher effort, medium-high impact)

### F9. MFE/MAE (Maximum Favorable/Adverse Excursion)
**Status:** Not in schema
**What:** Per trade, track highest unrealized profit (MFE) and deepest unrealized loss (MAE) before close. Calculate efficiency = actual_profit / MFE. Scatter plot of MAE vs outcome.
**Why:** The most precise tool for exit optimization. "Your average MFE is 2.6R but you take profit at 1.5R — you're leaving 42% on the table."
**Requires:** New columns on `round_trips` (mfe, mae). Manual entry or bracket order data. Scatter plot visualization.
**Note:** Harder for options because it requires intraday option prices. Pragmatic approach: manual entry or derive from order data if E*Trade provides it.

### F10. Calendar Heatmap with Drill-Down
**Status:** Basic calendar exists, no drill-down
**What:** Full month navigation. Color intensity proportional to P/L magnitude. Click any day to see trades. Overlay economic events (FOMC, CPI, jobs). Year-over-year comparison.
**Why:** Visual pattern detection — "I always lose on FOMC days" — that tables can't reveal. Inspired by TradesViz calendar.
**Requires:** Calendar component upgrade, event data source, click-to-drill-down.

### F11. Screenshot / Chart Annotation per Trade
**Status:** Schema has `screenshot_path`, no upload UI
**What:** Upload a chart screenshot per trade. View in trade review. Optional annotation overlay.
**Why:** Visual review is faster than reading numbers. Forces the habit of marking entries/exits on charts.
**Requires:** File upload endpoint, image storage, display in trade detail view.

### F12. AI Natural Language Query
**Status:** Not implemented
**What:** Ask questions like "What's my win rate on QQQ calls on Mondays?" and get answers from your data. LLM generates SQL against your schema.
**Why:** Lowers barrier to ad-hoc analysis. Not as impactful as behavioral features but dramatically reduces time to insight.
**Requires:** LLM integration (local or API), SQL generation, result display.

---

## Target Tech Stack

**Runtime:** Bun (built-in SQLite, no native compilation)
**API:** Hono (14KB framework)
**Frontend:** Vite + React + shadcn/ui + Tailwind + Recharts
**Database:** SQLite via `bun:sqlite`
**Deployment:** Docker (~100MB image)

## Principles
- Every feature must answer: "Does this help me trade better?"
- Behavior change > data display
- Lightweight > feature-rich — ship fast, iterate
- Schema-first: design the data model, UI follows
- Self-hosted, single-user, privacy-first
