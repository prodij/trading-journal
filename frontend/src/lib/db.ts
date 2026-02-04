import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Support both local dev and Docker environments
function getDbPath(): string {
  const possiblePaths = [
    path.join(process.cwd(), 'data', 'journal.db'),      // Docker: /app/data/journal.db
    path.join(process.cwd(), '..', 'data', 'journal.db'), // Local dev: ../data/journal.db
    '/app/data/journal.db',                               // Docker absolute
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  // Default to Docker path (will be created)
  return possiblePaths[0];
}

const DB_PATH = getDbPath();

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}

export interface Trade {
  id: number;
  date: string;
  underlying: string;
  strike: number;
  option_type: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
  gross_pnl: number;
  net_pnl: number;
  commission_total: number;
  setup_type: string | null;
  notes: string | null;
}

export interface DailySummary {
  date: string;
  total_trades: number;
  winners: number;
  losers: number;
  scratches: number;
  win_rate: number;
  gross_pnl: number;
  commissions: number;
  net_pnl: number;
  profit_factor: number;
  largest_win: number;
  largest_loss: number;
}

export interface SetupPerformance {
  setup_type: string;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

export interface EquityPoint {
  date: string;
  daily_pnl: number;
  cumulative_pnl: number;
  total_trades: number;
  win_rate: number;
}

export function getTrades(date?: string): Trade[] {
  const db = getDb();
  if (date) {
    return db.prepare(`
      SELECT * FROM round_trips WHERE date = ? ORDER BY id
    `).all(date) as Trade[];
  }
  return db.prepare(`
    SELECT * FROM round_trips ORDER BY date DESC, id DESC LIMIT 100
  `).all() as Trade[];
}

export function getDailySummaries(days: number = 30): DailySummary[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM daily_summary 
    ORDER BY date DESC 
    LIMIT ?
  `).all(days) as DailySummary[];
}

export function getEquityCurve(): EquityPoint[] {
  const db = getDb();
  return db.prepare(`
    SELECT 
      date,
      net_pnl as daily_pnl,
      SUM(net_pnl) OVER (ORDER BY date) as cumulative_pnl,
      total_trades,
      win_rate
    FROM daily_summary
    ORDER BY date
  `).all() as EquityPoint[];
}

export function getSetupPerformance(): SetupPerformance[] {
  const db = getDb();
  return db.prepare(`
    SELECT 
      setup_type,
      COUNT(*) as trade_count,
      SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as winners,
      SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) as losers,
      ROUND(SUM(CASE WHEN net_pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as win_rate,
      ROUND(SUM(net_pnl), 2) as total_pnl,
      ROUND(AVG(net_pnl), 2) as avg_pnl
    FROM round_trips
    WHERE setup_type IS NOT NULL
    GROUP BY setup_type
    ORDER BY total_pnl DESC
  `).all() as SetupPerformance[];
}

export function getStats(days: number = 30) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  
  const row = db.prepare(`
    SELECT 
      COUNT(*) as days_traded,
      SUM(total_trades) as total_trades,
      SUM(winners) as winners,
      SUM(losers) as losers,
      ROUND(SUM(net_pnl), 2) as net_pnl,
      ROUND(SUM(commissions), 2) as commissions,
      ROUND(MAX(net_pnl), 2) as best_day,
      ROUND(MIN(net_pnl), 2) as worst_day,
      ROUND(AVG(net_pnl), 2) as avg_daily
    FROM daily_summary WHERE date >= ?
  `).get(cutoffStr) as any;
  
  return {
    ...row,
    win_rate: row.total_trades > 0 ? (row.winners / row.total_trades * 100).toFixed(1) : 0
  };
}

export function getWeekdayPerformance() {
  const db = getDb();
  return db.prepare(`
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
    ORDER BY weekday_num
  `).all();
}
