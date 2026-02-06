import type { Database } from 'bun:sqlite';
import { buildOccSymbol, calculateRoundTrips, calculateDailySummary } from './import';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedPasteExecution {
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM:SS (24h)
  transactionType: string; // Bought / Sold
  underlying: string;
  expiration: string;     // YYYY-MM-DD
  strike: number;
  optionType: 'Call' | 'Put';
  quantity: number;
  price: number;
  commission: number;
}

export interface PasteImportResult {
  updated: number;
  inserted: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/**
 * Parse paste description like:
 *   "Buy Open 1 QQQ Feb 06 '26 $597 Put Limit Day"
 * Returns action (Buy/Sell), qty, underlying, expiration, strike, optionType.
 */
export function parsePasteDescription(desc: string): {
  action: 'Buy' | 'Sell';
  quantity: number;
  underlying: string;
  expiration: string;
  strike: number;
  optionType: 'Call' | 'Put';
} | null {
  // Pattern: (Buy|Sell) (Open|Close) <qty> <underlying> <Mon> <DD> '<YY> $<strike> (Call|Put) ...
  const match = desc.match(
    /^(Buy|Sell)\s+(?:Open|Close)\s+(\d+)\s+([A-Z]+)\s+(\w{3})\s+(\d{1,2})\s+'(\d{2})\s+\$(\d+(?:\.\d+)?)\s+(Call|Put)/i
  );
  if (!match) return null;

  const action = match[1] as 'Buy' | 'Sell';
  const quantity = parseInt(match[2], 10);
  const underlying = match[3];
  const monthStr = match[4];
  const day = match[5].padStart(2, '0');
  const year = `20${match[6]}`;
  const strike = parseFloat(match[7]);
  const optionType = match[8] as 'Call' | 'Put';

  const month = MONTH_MAP[monthStr];
  if (!month) return null;

  const expiration = `${year}-${month}-${day}`;

  return { action, quantity, underlying, expiration, strike, optionType };
}

/**
 * Parse paste timestamp like "02/05/26 11:20:00 AM EST"
 * Returns { date: 'YYYY-MM-DD', time: 'HH:MM:SS' } in 24h format.
 */
export function parsePasteTimestamp(ts: string): { date: string; time: string } | null {
  // Pattern: MM/DD/YY HH:MM:SS AM/PM <timezone>
  const match = ts.trim().match(
    /^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)\s+\w+$/i
  );
  if (!match) return null;

  const month = match[1];
  const day = match[2];
  const year = `20${match[3]}`;
  let hour = parseInt(match[4], 10);
  const min = match[5];
  const sec = match[6];
  const ampm = match[7].toUpperCase();

  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const date = `${year}-${month}-${day}`;
  const time = `${String(hour).padStart(2, '0')}:${min}:${sec}`;

  return { date, time };
}

/**
 * Parse pasted order history text.
 * Filters to "Executed" rows only, parses each into a structured execution.
 */
export function parsePasteContent(text: string): ParsedPasteExecution[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const results: ParsedPasteExecution[] = [];

  for (const line of lines) {
    // Split on tabs
    const fields = line.split('\t');
    if (fields.length < 6) continue;

    const status = fields[0].trim();
    if (status !== 'Executed') continue;

    const description = fields[1].trim();
    const timestamp = fields[2].trim();
    const qtyField = fields[3].trim();
    const priceField = fields[4].trim();
    const commField = fields[5].trim();

    // Skip rows without a real price (dash or empty)
    if (!priceField || priceField === '—' || priceField === '-') continue;

    const parsed = parsePasteDescription(description);
    if (!parsed) continue;

    const ts = parsePasteTimestamp(timestamp);
    if (!ts) continue;

    const quantity = parseInt(qtyField, 10) || parsed.quantity;
    const price = parseFloat(priceField);
    const commission = parseFloat(commField) || 0;

    if (isNaN(price)) continue;

    const transactionType = parsed.action === 'Buy' ? 'Bought' : 'Sold';

    results.push({
      date: ts.date,
      time: ts.time,
      transactionType,
      underlying: parsed.underlying,
      expiration: parsed.expiration,
      strike: parsed.strike,
      optionType: parsed.optionType,
      quantity,
      price,
      commission,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Import orchestrator
// ---------------------------------------------------------------------------

interface ChangesResult {
  c: number;
}

/**
 * Import pasted E*Trade order history into the database.
 *
 * Strategy:
 * 1. For each parsed execution, try UPDATE matching execution's `time` where `time IS NULL`
 * 2. If 0 rows updated, INSERT new execution (build OCC symbol, calculate amount)
 * 3. Recalculate round_trips + daily_summary for affected dates
 */
export function importPaste(db: Database, text: string): PasteImportResult {
  const executions = parsePasteContent(text);

  let updated = 0;
  let inserted = 0;
  let skipped = 0;
  const datesAffected = new Set<string>();

  const updateTime = db.query(`
    UPDATE executions SET time = ?
    WHERE date = ? AND underlying = ? AND expiration = ? AND strike = ?
      AND option_type = ? AND transaction_type = ? AND quantity = ? AND price = ?
      AND time IS NULL
    LIMIT 1
  `);

  const insertExecution = db.query(`
    INSERT OR IGNORE INTO executions
    (date, time, transaction_type, security_type, symbol, underlying, expiration,
     strike, option_type, quantity, price, amount, commission)
    VALUES (?, ?, ?, 'OPTN', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const doImport = db.transaction(() => {
    for (const exec of executions) {
      // Try to update an existing execution that has no time
      updateTime.run(
        exec.time,
        exec.date, exec.underlying, exec.expiration, exec.strike,
        exec.optionType, exec.transactionType, exec.quantity, exec.price,
      );

      const updateChanges = db.query<ChangesResult, []>('SELECT changes() as c').get();
      if (updateChanges && updateChanges.c > 0) {
        updated++;
        datesAffected.add(exec.date);
        continue;
      }

      // No matching row to update — try INSERT
      const symbol = buildOccSymbol(exec.underlying, exec.expiration, exec.optionType, exec.strike);
      // Amount convention: bought = negative, sold = positive
      const sign = exec.transactionType === 'Bought' ? -1 : 1;
      const amount = (exec.price * exec.quantity * 100 * sign) - exec.commission;

      insertExecution.run(
        exec.date, exec.time, exec.transactionType, symbol,
        exec.underlying, exec.expiration, exec.strike, exec.optionType,
        exec.quantity, exec.price, amount, exec.commission,
      );

      const insertChanges = db.query<ChangesResult, []>('SELECT changes() as c').get();
      if (insertChanges && insertChanges.c > 0) {
        inserted++;
        datesAffected.add(exec.date);
      } else {
        skipped++;
      }
    }
  });

  doImport();

  // Recalculate round trips and daily summary for each affected date
  for (const tradeDate of datesAffected) {
    calculateRoundTrips(db, tradeDate);
    calculateDailySummary(db, tradeDate);
  }

  return { updated, inserted, skipped };
}
