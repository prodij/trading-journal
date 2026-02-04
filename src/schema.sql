-- Trading Journal Database Schema
-- Version: 1.0.0

-------------------------------------------------
-- CORE TABLES
-------------------------------------------------

-- Raw executions from broker
CREATE TABLE IF NOT EXISTS executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    time TIME,
    transaction_type TEXT NOT NULL,      -- Bought/Sold
    security_type TEXT,                  -- OPTN/Stock
    symbol TEXT NOT NULL,                -- OCC symbol or ticker
    underlying TEXT NOT NULL,
    expiration DATE,
    strike REAL,
    option_type TEXT,                    -- Call/Put/null for stock
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    amount REAL NOT NULL,                -- Net amount (includes commission)
    commission REAL DEFAULT 0,
    fees REAL DEFAULT 0,                 -- SEC/exchange fees
    description TEXT,
    account TEXT,
    broker TEXT DEFAULT 'etrade',
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data TEXT,                       -- Original CSV row as JSON
    UNIQUE(date, symbol, transaction_type, quantity, price, amount)
);

-- Matched round-trip trades with P/L
CREATE TABLE IF NOT EXISTS round_trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    underlying TEXT NOT NULL,
    expiration DATE,
    strike REAL,
    option_type TEXT,
    direction TEXT DEFAULT 'Long',       -- Long/Short
    quantity INTEGER NOT NULL,
    
    -- Pricing
    entry_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    entry_amount REAL,                   -- Actual cost with fees
    exit_amount REAL,                    -- Actual proceeds with fees
    
    -- P/L
    gross_pnl REAL NOT NULL,             -- Price-based P/L (no fees)
    net_pnl REAL NOT NULL,               -- Including commissions
    commission_total REAL,
    pnl_percent REAL,                    -- % return on risk
    
    -- Timing
    entry_time TIME,
    exit_time TIME,
    hold_time_minutes INTEGER,
    
    -- Context (filled in manually or via UI)
    setup_type TEXT,                     -- pullback, breakout, reversal, scalp, etc.
    market_regime TEXT,                  -- trending_up, trending_down, range, volatile
    time_of_day TEXT,                    -- open, morning, midday, afternoon, close
    conviction_level INTEGER,            -- 1-5 scale
    
    -- Review
    followed_plan BOOLEAN,
    mistake_type TEXT,                   -- early_entry, late_exit, fomo, revenge, etc.
    lesson TEXT,
    grade TEXT,                          -- A/B/C/D/F
    screenshot_path TEXT,
    
    -- Metadata
    notes TEXT,
    tags TEXT,                           -- comma-separated tags
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily trading summary
CREATE TABLE IF NOT EXISTS daily_summary (
    date DATE PRIMARY KEY,
    
    -- Trade counts
    total_trades INTEGER,
    winners INTEGER,
    losers INTEGER,
    scratches INTEGER DEFAULT 0,
    
    -- P/L
    gross_pnl REAL,
    commissions REAL,
    net_pnl REAL,
    
    -- Stats
    win_rate REAL,
    profit_factor REAL,
    largest_win REAL,
    largest_loss REAL,
    avg_winner REAL,
    avg_loser REAL,
    avg_trade REAL,
    
    -- Risk
    max_drawdown REAL,                   -- Intraday drawdown
    risk_reward_avg REAL,
    
    -- Context
    market_regime TEXT,                  -- Overall market condition
    vix_open REAL,
    spy_change_pct REAL,
    qqq_change_pct REAL,
    
    -- Journal
    pre_market_plan TEXT,
    post_market_review TEXT,
    mood_start TEXT,                     -- focused, tired, anxious, confident
    mood_end TEXT,
    energy_level INTEGER,                -- 1-10
    sleep_hours REAL,
    followed_rules BOOLEAN,
    biggest_lesson TEXT,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-------------------------------------------------
-- REFERENCE TABLES
-------------------------------------------------

-- Setup type definitions
CREATE TABLE IF NOT EXISTS setup_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    rules TEXT,                          -- Entry/exit rules
    ideal_conditions TEXT,               -- When this setup works best
    avoid_conditions TEXT,               -- When to skip
    examples TEXT,                       -- Trade IDs that exemplify this
    win_rate REAL,                       -- Calculated
    avg_pnl REAL,                        -- Calculated
    trade_count INTEGER DEFAULT 0
);

-- Pre-populate common setups
INSERT OR IGNORE INTO setup_types (name, description) VALUES 
    ('pullback', 'Buy dip in uptrend / sell rally in downtrend'),
    ('breakout', 'Entry on break of key level with momentum'),
    ('reversal', 'Counter-trend at exhaustion point'),
    ('scalp', 'Quick in/out on momentum'),
    ('gamma_scalp', 'Trading dealer hedging flows using gamma levels'),
    ('earnings_play', 'Directional or vol play around earnings'),
    ('trend_follow', 'Riding established trend'),
    ('mean_reversion', 'Fade extended move back to average'),
    ('support_bounce', 'Long at support level'),
    ('resistance_fade', 'Short at resistance level');

-- Market condition definitions
CREATE TABLE IF NOT EXISTS market_conditions (
    date DATE PRIMARY KEY,
    regime TEXT,                         -- trending_up, trending_down, range, volatile, crash
    trend_strength INTEGER,              -- 1-5
    volatility_level TEXT,               -- low, normal, high, extreme
    vix_level REAL,
    spy_atr REAL,
    key_levels TEXT,                     -- JSON: support/resistance levels
    catalysts TEXT,                      -- earnings, fed, economic data, etc.
    notes TEXT
);

-- Tags for flexible categorization
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT,
    description TEXT
);

-- Trade-tag junction
CREATE TABLE IF NOT EXISTS trade_tags (
    trade_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY (trade_id, tag_id),
    FOREIGN KEY (trade_id) REFERENCES round_trips(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
);

-------------------------------------------------
-- ANALYTICS VIEWS
-------------------------------------------------

-- Performance by setup type
CREATE VIEW IF NOT EXISTS v_performance_by_setup AS
SELECT 
    setup_type,
    COUNT(*) as trade_count,
    SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as winners,
    SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) as losers,
    ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
    ROUND(SUM(net_pnl), 2) as total_pnl,
    ROUND(AVG(net_pnl), 2) as avg_pnl,
    ROUND(AVG(CASE WHEN net_pnl > 0 THEN net_pnl END), 2) as avg_winner,
    ROUND(AVG(CASE WHEN net_pnl < 0 THEN net_pnl END), 2) as avg_loser
FROM round_trips
WHERE setup_type IS NOT NULL
GROUP BY setup_type
ORDER BY total_pnl DESC;

-- Performance by time of day
CREATE VIEW IF NOT EXISTS v_performance_by_time AS
SELECT 
    time_of_day,
    COUNT(*) as trade_count,
    ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
    ROUND(SUM(net_pnl), 2) as total_pnl,
    ROUND(AVG(net_pnl), 2) as avg_pnl
FROM round_trips
WHERE time_of_day IS NOT NULL
GROUP BY time_of_day;

-- Performance by market regime
CREATE VIEW IF NOT EXISTS v_performance_by_regime AS
SELECT 
    market_regime,
    COUNT(*) as trade_count,
    ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
    ROUND(SUM(net_pnl), 2) as total_pnl,
    ROUND(AVG(net_pnl), 2) as avg_pnl
FROM round_trips
WHERE market_regime IS NOT NULL
GROUP BY market_regime;

-- Performance by day of week
CREATE VIEW IF NOT EXISTS v_performance_by_weekday AS
SELECT 
    CASE CAST(strftime('%w', date) AS INTEGER)
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
    END as weekday,
    CAST(strftime('%w', date) AS INTEGER) as weekday_num,
    COUNT(*) as trade_count,
    ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
    ROUND(SUM(net_pnl), 2) as total_pnl,
    ROUND(AVG(net_pnl), 2) as avg_pnl
FROM round_trips
GROUP BY weekday_num
ORDER BY weekday_num;

-- Equity curve data
CREATE VIEW IF NOT EXISTS v_equity_curve AS
SELECT 
    date,
    net_pnl as daily_pnl,
    SUM(net_pnl) OVER (ORDER BY date) as cumulative_pnl,
    total_trades,
    win_rate
FROM daily_summary
ORDER BY date;

-- Mistake analysis
CREATE VIEW IF NOT EXISTS v_mistakes AS
SELECT 
    mistake_type,
    COUNT(*) as occurrence_count,
    ROUND(SUM(net_pnl), 2) as total_cost,
    ROUND(AVG(net_pnl), 2) as avg_cost
FROM round_trips
WHERE mistake_type IS NOT NULL
GROUP BY mistake_type
ORDER BY total_cost ASC;

-------------------------------------------------
-- INDEXES
-------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_exec_date ON executions(date);
CREATE INDEX IF NOT EXISTS idx_exec_symbol ON executions(symbol);
CREATE INDEX IF NOT EXISTS idx_exec_underlying ON executions(underlying);

CREATE INDEX IF NOT EXISTS idx_rt_date ON round_trips(date);
CREATE INDEX IF NOT EXISTS idx_rt_underlying ON round_trips(underlying);
CREATE INDEX IF NOT EXISTS idx_rt_setup ON round_trips(setup_type);
CREATE INDEX IF NOT EXISTS idx_rt_regime ON round_trips(market_regime);

CREATE INDEX IF NOT EXISTS idx_ds_date ON daily_summary(date);
