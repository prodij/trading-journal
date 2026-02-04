#!/usr/bin/env python3
"""
Trading Journal CLI

Usage:
    journal.py import <csv_file>         Import trades from E*TRADE CSV
    journal.py today                     Show today's summary
    journal.py trades [date]             List trades for a date (YYYY-MM-DD)
    journal.py stats [days]              Show stats for last N days (default: 7)
    journal.py setups                    Performance by setup type
    journal.py weekdays                  Performance by day of week
    journal.py equity                    Show equity curve data
    journal.py tag <trade_id> <tags>     Add tags to a trade
    journal.py note <trade_id> <note>    Add note to a trade
    journal.py setup <trade_id> <type>   Set setup type for a trade
    journal.py review <date>             Interactive daily review
    journal.py export [format]           Export data (csv/json)
    journal.py serve                     Start API server
"""

import sqlite3
import csv
import sys
import re
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

# Paths
ROOT_DIR = Path(__file__).parent.parent
DB_PATH = ROOT_DIR / "data" / "journal.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def get_db() -> sqlite3.Connection:
    """Get database connection, initializing if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # Check if tables exist
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='executions'")
    if not cursor.fetchone():
        # Initialize schema
        with open(SCHEMA_PATH) as f:
            conn.executescript(f.read())
        conn.commit()
    
    return conn


def parse_occ_symbol(symbol: str) -> Optional[Dict]:
    """
    Parse OCC option symbol format.
    Example: QQQ---260205C00609000
    """
    match = re.match(r'([A-Z]+)-*(\d{6})([CP])(\d{8})', symbol)
    if not match:
        return None
    
    underlying = match.group(1)
    date_str = match.group(2)
    opt_type = 'Call' if match.group(3) == 'C' else 'Put'
    strike = int(match.group(4)) / 1000
    
    year = 2000 + int(date_str[:2])
    month = int(date_str[2:4])
    day = int(date_str[4:6])
    expiration = f"{year}-{month:02d}-{day:02d}"
    
    return {
        'underlying': underlying,
        'expiration': expiration,
        'option_type': opt_type,
        'strike': strike
    }


def parse_trade_date(date_str: str) -> str:
    """Parse date from MM/DD/YY to YYYY-MM-DD."""
    parts = date_str.split('/')
    if len(parts) != 3:
        raise ValueError(f"Invalid date: {date_str}")
    month, day, year = parts
    year = 2000 + int(year) if int(year) < 100 else int(year)
    return f"{year}-{int(month):02d}-{int(day):02d}"


def import_etrade_csv(filepath: str) -> int:
    """Import trades from E*TRADE CSV export."""
    conn = get_db()
    cursor = conn.cursor()
    
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    # Find header row
    header_idx = None
    for i, line in enumerate(lines):
        if line.startswith('TransactionDate'):
            header_idx = i
            break
    
    if header_idx is None:
        print("❌ Error: Could not find CSV headers")
        return 0
    
    reader = csv.DictReader(lines[header_idx:])
    imported = 0
    skipped = 0
    dates_affected = set()
    
    for row in reader:
        if not row.get('TransactionDate'):
            continue
        
        try:
            trade_date = parse_trade_date(row['TransactionDate'])
            dates_affected.add(trade_date)
        except ValueError:
            continue
        
        symbol = row['Symbol']
        parsed = parse_occ_symbol(symbol)
        
        if not parsed:
            # Could be stock trade
            continue
        
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO executions 
                (date, transaction_type, security_type, symbol, underlying, expiration, 
                 strike, option_type, quantity, price, amount, commission, description, raw_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                trade_date,
                row['TransactionType'],
                row['SecurityType'],
                symbol,
                parsed['underlying'],
                parsed['expiration'],
                parsed['strike'],
                parsed['option_type'],
                abs(int(row['Quantity'])),
                float(row['Price']),
                float(row['Amount']),
                float(row['Commission']),
                row.get('Description', ''),
                json.dumps(dict(row))
            ))
            
            if cursor.rowcount > 0:
                imported += 1
            else:
                skipped += 1
                
        except Exception as e:
            print(f"  ⚠️  Error: {e}")
            continue
    
    conn.commit()
    
    # Recalculate for affected dates
    for trade_date in dates_affected:
        calculate_round_trips(conn, trade_date)
        calculate_daily_summary(conn, trade_date)
    
    conn.close()
    
    print(f"✅ Imported {imported} executions ({skipped} duplicates skipped)")
    return imported


def calculate_round_trips(conn: sqlite3.Connection, trade_date: str):
    """Match buys and sells into round trips using FIFO."""
    cursor = conn.cursor()
    
    # Clear existing
    cursor.execute("DELETE FROM round_trips WHERE date = ?", (trade_date,))
    
    # Get unique contracts
    cursor.execute("""
        SELECT DISTINCT underlying, expiration, strike, option_type
        FROM executions WHERE date = ?
    """, (trade_date,))
    contracts = cursor.fetchall()
    
    for contract in contracts:
        underlying, expiration, strike, option_type = contract
        
        # Get buys
        cursor.execute("""
            SELECT id, quantity, price, amount, commission FROM executions
            WHERE date = ? AND underlying = ? AND expiration = ? AND strike = ? AND option_type = ?
            AND transaction_type = 'Bought' ORDER BY id
        """, (trade_date, underlying, expiration, strike, option_type))
        buys = list(cursor.fetchall())
        
        # Get sells
        cursor.execute("""
            SELECT id, quantity, price, amount, commission FROM executions
            WHERE date = ? AND underlying = ? AND expiration = ? AND strike = ? AND option_type = ?
            AND transaction_type = 'Sold' ORDER BY id
        """, (trade_date, underlying, expiration, strike, option_type))
        sells = list(cursor.fetchall())
        
        if not buys or not sells:
            continue
        
        # FIFO matching
        buy_idx = 0
        buy_remaining = buys[0]['quantity']
        buy_price = buys[0]['price']
        buy_amount_per = buys[0]['amount'] / buys[0]['quantity']
        buy_comm_per = buys[0]['commission'] / buys[0]['quantity']
        
        for sell in sells:
            remaining = sell['quantity']
            sell_price = sell['price']
            sell_amount_per = sell['amount'] / sell['quantity']
            sell_comm_per = sell['commission'] / sell['quantity']
            
            while remaining > 0 and buy_idx < len(buys):
                match_qty = min(remaining, buy_remaining)
                
                if match_qty > 0:
                    gross_pnl = (sell_price - buy_price) * match_qty * 100
                    net_pnl = (sell_amount_per * match_qty) + (buy_amount_per * match_qty)
                    total_comm = (buy_comm_per + sell_comm_per) * match_qty
                    pnl_pct = ((sell_price / buy_price) - 1) * 100 if buy_price else 0
                    
                    cursor.execute("""
                        INSERT INTO round_trips 
                        (date, underlying, expiration, strike, option_type, direction,
                         quantity, entry_price, exit_price, entry_amount, exit_amount,
                         gross_pnl, net_pnl, commission_total, pnl_percent)
                        VALUES (?, ?, ?, ?, ?, 'Long', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (trade_date, underlying, expiration, strike, option_type,
                          match_qty, buy_price, sell_price, 
                          abs(buy_amount_per * match_qty), sell_amount_per * match_qty,
                          gross_pnl, net_pnl, total_comm, pnl_pct))
                
                remaining -= match_qty
                buy_remaining -= match_qty
                
                if buy_remaining <= 0:
                    buy_idx += 1
                    if buy_idx < len(buys):
                        buy_remaining = buys[buy_idx]['quantity']
                        buy_price = buys[buy_idx]['price']
                        buy_amount_per = buys[buy_idx]['amount'] / buys[buy_idx]['quantity']
                        buy_comm_per = buys[buy_idx]['commission'] / buys[buy_idx]['quantity']
    
    conn.commit()


def calculate_daily_summary(conn: sqlite3.Connection, trade_date: str):
    """Calculate daily statistics."""
    cursor = conn.cursor()
    
    cursor.execute("""
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
    """, (trade_date,))
    
    row = cursor.fetchone()
    if not row or row['total'] == 0:
        return
    
    # Profit factor
    cursor.execute("SELECT SUM(net_pnl) FROM round_trips WHERE date = ? AND net_pnl > 0", (trade_date,))
    gross_wins = cursor.fetchone()[0] or 0
    cursor.execute("SELECT ABS(SUM(net_pnl)) FROM round_trips WHERE date = ? AND net_pnl < 0", (trade_date,))
    gross_losses = cursor.fetchone()[0] or 0.01
    profit_factor = gross_wins / gross_losses if gross_losses > 0 else 0
    
    win_rate = (row['winners'] / row['total'] * 100) if row['total'] > 0 else 0
    
    cursor.execute("""
        INSERT OR REPLACE INTO daily_summary 
        (date, total_trades, winners, losers, scratches, win_rate, gross_pnl, 
         commissions, net_pnl, largest_win, largest_loss, avg_winner, avg_loser, 
         avg_trade, profit_factor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (trade_date, row['total'], row['winners'], row['losers'], row['scratches'],
          win_rate, row['gross_pnl'], row['commissions'], row['net_pnl'],
          row['largest_win'], row['largest_loss'], row['avg_winner'], row['avg_loser'],
          row['avg_trade'], profit_factor))
    
    conn.commit()


def show_trades(date: str):
    """Show trades for a specific date."""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get summary
    cursor.execute("SELECT * FROM daily_summary WHERE date = ?", (date,))
    summary = cursor.fetchone()
    
    if not summary:
        print(f"No trades found for {date}")
        return
    
    print(f"\n📊 Trading Journal — {date}")
    print("=" * 60)
    
    # Get trades
    cursor.execute("""
        SELECT id, underlying, strike, option_type, quantity, entry_price, exit_price, 
               net_pnl, setup_type, notes
        FROM round_trips WHERE date = ? ORDER BY id
    """, (date,))
    
    for trade in cursor.fetchall():
        status = "✓" if trade['net_pnl'] > 0 else "✗" if trade['net_pnl'] < 0 else "—"
        setup = f"[{trade['setup_type']}]" if trade['setup_type'] else ""
        print(f"  #{trade['id']:3}  ${trade['strike']:.0f} {trade['option_type']:4}  "
              f"{trade['quantity']}x  ${trade['entry_price']:.2f} → ${trade['exit_price']:.2f}  "
              f"= ${trade['net_pnl']:+8.2f} {status} {setup}")
    
    print("=" * 60)
    print(f"  Net P/L:        ${summary['net_pnl']:+.2f}")
    print(f"  Gross P/L:      ${summary['gross_pnl']:+.2f}")
    print(f"  Commissions:    ${summary['commissions']:.2f}")
    print(f"  Win Rate:       {summary['win_rate']:.0f}% ({summary['winners']}W / {summary['losers']}L)")
    print(f"  Profit Factor:  {summary['profit_factor']:.2f}")
    
    if summary['notes']:
        print(f"\n  Notes: {summary['notes']}")
    print()
    
    conn.close()


def show_stats(days: int = 7):
    """Show aggregate stats."""
    conn = get_db()
    cursor = conn.cursor()
    
    cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    
    cursor.execute("""
        SELECT 
            COUNT(*) as days_traded,
            SUM(total_trades) as total_trades,
            SUM(winners) as winners,
            SUM(losers) as losers,
            SUM(net_pnl) as net_pnl,
            SUM(commissions) as commissions,
            MAX(net_pnl) as best_day,
            MIN(net_pnl) as worst_day,
            AVG(net_pnl) as avg_daily
        FROM daily_summary WHERE date >= ?
    """, (cutoff,))
    
    row = cursor.fetchone()
    if not row or row['days_traded'] == 0:
        print(f"No trades in last {days} days")
        return
    
    win_rate = (row['winners'] / row['total_trades'] * 100) if row['total_trades'] else 0
    
    print(f"\n📈 {days}-Day Performance")
    print("=" * 50)
    print(f"  Days Traded:    {row['days_traded']}")
    print(f"  Total Trades:   {row['total_trades']}")
    print(f"  Net P/L:        ${row['net_pnl']:+.2f}")
    print(f"  Commissions:    ${row['commissions']:.2f}")
    print(f"  Win Rate:       {win_rate:.0f}%")
    print(f"  Best Day:       ${row['best_day']:+.2f}")
    print(f"  Worst Day:      ${row['worst_day']:+.2f}")
    print(f"  Avg Daily:      ${row['avg_daily']:+.2f}")
    
    # Daily breakdown
    cursor.execute("""
        SELECT date, total_trades, winners, losers, net_pnl 
        FROM daily_summary WHERE date >= ? ORDER BY date DESC
    """, (cutoff,))
    
    print("\n  Daily Breakdown:")
    for day in cursor.fetchall():
        indicator = "🟢" if day['net_pnl'] >= 0 else "🔴"
        print(f"    {day['date']}  {day['total_trades']:2} trades  "
              f"{day['winners']}W/{day['losers']}L  ${day['net_pnl']:+8.2f}  {indicator}")
    print()
    
    conn.close()


def show_setups():
    """Show performance by setup type."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM v_performance_by_setup")
    rows = cursor.fetchall()
    
    if not rows:
        print("No setup data yet. Tag your trades with: journal.py setup <trade_id> <setup_type>")
        return
    
    print("\n📊 Performance by Setup Type")
    print("=" * 70)
    print(f"  {'Setup':<15} {'Trades':>7} {'Win%':>6} {'Total P/L':>12} {'Avg P/L':>10}")
    print("-" * 70)
    
    for row in rows:
        print(f"  {row['setup_type']:<15} {row['trade_count']:>7} {row['win_rate']:>5.0f}% "
              f"${row['total_pnl']:>+10.2f} ${row['avg_pnl']:>+9.2f}")
    print()
    
    conn.close()


def set_trade_setup(trade_id: int, setup_type: str):
    """Set setup type for a trade."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE round_trips SET setup_type = ? WHERE id = ?", (setup_type, trade_id))
    conn.commit()
    
    if cursor.rowcount:
        print(f"✅ Trade #{trade_id} tagged as '{setup_type}'")
    else:
        print(f"❌ Trade #{trade_id} not found")
    
    conn.close()


def add_trade_note(trade_id: int, note: str):
    """Add note to a trade."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE round_trips SET notes = ? WHERE id = ?", (note, trade_id))
    conn.commit()
    
    if cursor.rowcount:
        print(f"✅ Note added to trade #{trade_id}")
    else:
        print(f"❌ Trade #{trade_id} not found")
    
    conn.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    
    cmd = sys.argv[1].lower()
    
    if cmd == 'import' and len(sys.argv) > 2:
        count = import_etrade_csv(sys.argv[2])
        if count > 0:
            show_trades(datetime.now().strftime('%Y-%m-%d'))
    
    elif cmd == 'today':
        show_trades(datetime.now().strftime('%Y-%m-%d'))
    
    elif cmd == 'trades':
        date = sys.argv[2] if len(sys.argv) > 2 else datetime.now().strftime('%Y-%m-%d')
        show_trades(date)
    
    elif cmd == 'stats':
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
        show_stats(days)
    
    elif cmd == 'setups':
        show_setups()
    
    elif cmd == 'setup' and len(sys.argv) > 3:
        set_trade_setup(int(sys.argv[2]), sys.argv[3])
    
    elif cmd == 'note' and len(sys.argv) > 3:
        add_trade_note(int(sys.argv[2]), ' '.join(sys.argv[3:]))
    
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
