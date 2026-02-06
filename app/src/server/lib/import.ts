import type { Database } from 'bun:sqlite';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedOccSymbol {
  underlying: string;
  expiration: string;
  optionType: 'Call' | 'Put';
  strike: number;
}

interface ParsedExecution {
  date: string;
  transactionType: string;
  securityType: string;
  symbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  optionType: string;
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  description: string;
  rawData: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse OCC option symbol format.
 * Example: QQQ---260205C00609000
 */
export function parseOccSymbol(symbol: string): ParsedOccSymbol | null {
  const match = symbol.match(/^([A-Z]+)-*(\d{6})([CP])(\d{8})$/);
  if (!match) return null;

  const underlying = match[1];
  const dateStr = match[2];
  const optionType: 'Call' | 'Put' = match[3] === 'C' ? 'Call' : 'Put';
  const strike = parseInt(match[4], 10) / 1000;

  const year = 2000 + parseInt(dateStr.slice(0, 2), 10);
  const month = parseInt(dateStr.slice(2, 4), 10);
  const day = parseInt(dateStr.slice(4, 6), 10);
  const expiration = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { underlying, expiration, optionType, strike };
}

/**
 * Build OCC option symbol from components.
 * Inverse of parseOccSymbol().
 * Example: buildOccSymbol('QQQ', '2026-02-05', 'Call', 609) → 'QQQ---260205C00609000'
 */
export function buildOccSymbol(underlying: string, expiration: string, optionType: 'Call' | 'Put', strike: number): string {
  const [yearStr, month, day] = expiration.split('-');
  const yy = yearStr.slice(2);
  const dateStr = `${yy}${month}${day}`;
  const typeChar = optionType === 'Call' ? 'C' : 'P';
  const strikeInt = Math.round(strike * 1000);
  const strikePadded = String(strikeInt).padStart(8, '0');
  const padding = '-'.repeat(Math.max(0, 6 - underlying.length));
  return `${underlying}${padding}${dateStr}${typeChar}${strikePadded}`;
}

/**
 * Parse date from MM/DD/YY to YYYY-MM-DD.
 */
export function parseTradeDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) throw new Error(`Invalid date: ${dateStr}`);

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles fields wrapped in double-quotes that may contain commas.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse E*Trade CSV content into an array of execution objects.
 * Finds the header row starting with 'TransactionDate', then parses each
 * subsequent row. Skips non-option rows (where parseOccSymbol returns null).
 */
export function parseCsv(content: string): ParsedExecution[] {
  const lines = content.split(/\r?\n/);

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('TransactionDate')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('Could not find CSV headers (expected row starting with TransactionDate)');
  }

  const headers = parseCsvLine(lines[headerIdx]);
  const executions: ParsedExecution[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    // Build a record from headers -> values
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }

    if (!row['TransactionDate']) continue;

    let tradeDate: string;
    try {
      tradeDate = parseTradeDate(row['TransactionDate']);
    } catch {
      continue;
    }

    const symbol = row['Symbol'] ?? '';
    const parsed = parseOccSymbol(symbol);
    if (!parsed) continue; // Skip non-option rows

    try {
      executions.push({
        date: tradeDate,
        transactionType: row['TransactionType'] ?? '',
        securityType: row['SecurityType'] ?? '',
        symbol,
        underlying: parsed.underlying,
        expiration: parsed.expiration,
        strike: parsed.strike,
        optionType: parsed.optionType,
        quantity: Math.abs(parseInt(row['Quantity'] ?? '0', 10)),
        price: parseFloat(row['Price'] ?? '0'),
        amount: parseFloat(row['Amount'] ?? '0'),
        commission: parseFloat(row['Commission'] ?? '0'),
        description: row['Description'] ?? '',
        rawData: JSON.stringify(row),
      });
    } catch {
      // Skip malformed rows
      continue;
    }
  }

  return executions;
}

// ---------------------------------------------------------------------------
// Round-trip FIFO matching
// ---------------------------------------------------------------------------

interface ExecutionRow {
  id: number;
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  time: string | null;
}

interface ContractKey {
  underlying: string;
  expiration: string;
  strike: number;
  option_type: string;
}

/**
 * Match buys and sells into round trips using FIFO for a given trade date.
 * Mirrors the Python calculate_round_trips exactly.
 */
export function calculateRoundTrips(db: Database, tradeDate: string): void {
  // Clear existing round trips for this date
  db.query('DELETE FROM round_trips WHERE date = ?').run(tradeDate);

  // Get unique contracts for this date
  const contracts = db.query<ContractKey, [string]>(`
    SELECT DISTINCT underlying, expiration, strike, option_type
    FROM executions WHERE date = ?
  `).all(tradeDate);

  for (const contract of contracts) {
    const { underlying, expiration, strike, option_type } = contract;

    // Get buys ordered by id (FIFO)
    const buys = db.query<ExecutionRow, [string, string, string, number, string]>(`
      SELECT id, quantity, price, amount, commission, time FROM executions
      WHERE date = ? AND underlying = ? AND expiration = ? AND strike = ? AND option_type = ?
      AND transaction_type = 'Bought' ORDER BY id
    `).all(tradeDate, underlying, expiration, strike, option_type);

    // Get sells ordered by id
    const sells = db.query<ExecutionRow, [string, string, string, number, string]>(`
      SELECT id, quantity, price, amount, commission, time FROM executions
      WHERE date = ? AND underlying = ? AND expiration = ? AND strike = ? AND option_type = ?
      AND transaction_type = 'Sold' ORDER BY id
    `).all(tradeDate, underlying, expiration, strike, option_type);

    if (buys.length === 0 || sells.length === 0) continue;

    // FIFO matching
    let buyIdx = 0;
    let buyRemaining = buys[0].quantity;
    let buyPrice = buys[0].price;
    let buyAmountPer = buys[0].amount / buys[0].quantity;
    let buyCommPer = buys[0].commission / buys[0].quantity;
    let buyTime = buys[0].time;

    const insertRoundTrip = db.query(`
      INSERT INTO round_trips
      (date, underlying, expiration, strike, option_type, direction,
       quantity, entry_price, exit_price, entry_amount, exit_amount,
       gross_pnl, net_pnl, commission_total, pnl_percent,
       entry_time, exit_time, hold_time_minutes)
      VALUES (?, ?, ?, ?, ?, 'Long', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const sell of sells) {
      let remaining = sell.quantity;
      const sellPrice = sell.price;
      const sellAmountPer = sell.amount / sell.quantity;
      const sellCommPer = sell.commission / sell.quantity;
      const sellTime = sell.time;

      while (remaining > 0 && buyIdx < buys.length) {
        const matchQty = Math.min(remaining, buyRemaining);

        if (matchQty > 0) {
          const grossPnl = (sellPrice - buyPrice) * matchQty * 100;
          const netPnl = (sellAmountPer * matchQty) + (buyAmountPer * matchQty);
          const totalComm = (buyCommPer + sellCommPer) * matchQty;
          const pnlPct = buyPrice !== 0 ? ((sellPrice / buyPrice) - 1) * 100 : 0;

          // Calculate hold time from entry/exit times
          let holdTimeMinutes: number | null = null;
          if (buyTime && sellTime) {
            const [bH, bM] = buyTime.split(':').map(Number);
            const [sH, sM] = sellTime.split(':').map(Number);
            holdTimeMinutes = (sH * 60 + sM) - (bH * 60 + bM);
            if (holdTimeMinutes < 0) holdTimeMinutes = null;
          }

          insertRoundTrip.run(
            tradeDate, underlying, expiration, strike, option_type,
            matchQty, buyPrice, sellPrice,
            Math.abs(buyAmountPer * matchQty), sellAmountPer * matchQty,
            grossPnl, netPnl, totalComm, pnlPct,
            buyTime, sellTime, holdTimeMinutes,
          );
        }

        remaining -= matchQty;
        buyRemaining -= matchQty;

        if (buyRemaining <= 0) {
          buyIdx++;
          if (buyIdx < buys.length) {
            buyRemaining = buys[buyIdx].quantity;
            buyPrice = buys[buyIdx].price;
            buyAmountPer = buys[buyIdx].amount / buys[buyIdx].quantity;
            buyCommPer = buys[buyIdx].commission / buys[buyIdx].quantity;
            buyTime = buys[buyIdx].time;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Daily summary aggregation
// ---------------------------------------------------------------------------

interface SummaryRow {
  total: number;
  winners: number;
  losers: number;
  scratches: number;
  gross_pnl: number;
  commissions: number;
  net_pnl: number;
  largest_win: number;
  largest_loss: number;
  avg_winner: number | null;
  avg_loser: number | null;
  avg_trade: number | null;
}

interface SumResult {
  value: number | null;
}

/**
 * Calculate daily statistics for a given trade date.
 * Mirrors the Python calculate_daily_summary exactly.
 */
export function calculateDailySummary(db: Database, tradeDate: string): void {
  const row = db.query<SummaryRow, [string]>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN net_pnl > 1 THEN 1 ELSE 0 END) as winners,
      SUM(CASE WHEN net_pnl < -1 THEN 1 ELSE 0 END) as losers,
      SUM(CASE WHEN net_pnl >= -1 AND net_pnl <= 1 THEN 1 ELSE 0 END) as scratches,
      SUM(gross_pnl) as gross_pnl,
      SUM(commission_total) as commissions,
      SUM(net_pnl) as net_pnl,
      MAX(net_pnl) as largest_win,
      MIN(net_pnl) as largest_loss,
      AVG(CASE WHEN net_pnl > 0 THEN net_pnl END) as avg_winner,
      AVG(CASE WHEN net_pnl < 0 THEN net_pnl END) as avg_loser,
      AVG(net_pnl) as avg_trade
    FROM round_trips WHERE date = ?
  `).get(tradeDate);

  if (!row || row.total === 0) return;

  // Profit factor
  const grossWinsRow = db.query<SumResult, [string]>(
    'SELECT SUM(net_pnl) as value FROM round_trips WHERE date = ? AND net_pnl > 0',
  ).get(tradeDate);
  const grossWins = grossWinsRow?.value ?? 0;

  const grossLossesRow = db.query<SumResult, [string]>(
    'SELECT ABS(SUM(net_pnl)) as value FROM round_trips WHERE date = ? AND net_pnl < 0',
  ).get(tradeDate);
  const grossLosses = grossLossesRow?.value ?? 0.01;

  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 0;
  const winRate = row.total > 0 ? (row.winners / row.total) * 100 : 0;

  db.query(`
    INSERT OR REPLACE INTO daily_summary
    (date, total_trades, winners, losers, scratches, win_rate, gross_pnl,
     commissions, net_pnl, largest_win, largest_loss, avg_winner, avg_loser,
     avg_trade, profit_factor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tradeDate, row.total, row.winners, row.losers, row.scratches,
    winRate, row.gross_pnl, row.commissions, row.net_pnl,
    row.largest_win, row.largest_loss, row.avg_winner, row.avg_loser,
    row.avg_trade, profitFactor,
  );
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

interface ChangesResult {
  c: number;
}

/**
 * Import an E*Trade CSV string into the database.
 *
 * 1. Parse CSV rows
 * 2. INSERT OR IGNORE each execution (inside a transaction)
 * 3. Track affected dates
 * 4. Recalculate round trips + daily summary for each affected date
 * 5. Return { imported, skipped }
 */
export function importCsv(db: Database, csvContent: string): ImportResult {
  const executions = parseCsv(csvContent);

  let imported = 0;
  let skipped = 0;
  const datesAffected = new Set<string>();

  // Bulk-insert inside a transaction for performance
  const insertExecution = db.query(`
    INSERT OR IGNORE INTO executions
    (date, transaction_type, security_type, symbol, underlying, expiration,
     strike, option_type, quantity, price, amount, commission, description, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const exec of executions) {
      insertExecution.run(
        exec.date,
        exec.transactionType,
        exec.securityType,
        exec.symbol,
        exec.underlying,
        exec.expiration,
        exec.strike,
        exec.optionType,
        exec.quantity,
        exec.price,
        exec.amount,
        exec.commission,
        exec.description,
        exec.rawData,
      );

      // Check if the INSERT actually inserted (vs ignored as duplicate)
      const changes = db.query<ChangesResult, []>('SELECT changes() as c').get();
      if (changes && changes.c > 0) {
        imported++;
      } else {
        skipped++;
      }

      datesAffected.add(exec.date);
    }
  });

  insertAll();

  // Recalculate round trips and daily summary for each affected date
  for (const tradeDate of datesAffected) {
    calculateRoundTrips(db, tradeDate);
    calculateDailySummary(db, tradeDate);
  }

  return { imported, skipped };
}
