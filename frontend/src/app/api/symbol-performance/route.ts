import { NextResponse } from 'next/server';
import { getUnderlyingPerformance } from '@/lib/db';

export async function GET() {
  try {
    const symbols = getUnderlyingPerformance();

    // Find best and worst
    const bestSymbol = symbols.length > 0 ? symbols[0] : null;
    const worstSymbol = symbols.length > 0 ? symbols[symbols.length - 1] : null;

    // Calculate focus vs avoid totals
    const profitable = symbols.filter(s => s.total_pnl > 0);
    const unprofitable = symbols.filter(s => s.total_pnl < 0);

    return NextResponse.json({
      symbols,
      insights: {
        bestSymbol,
        worstSymbol,
        profitableTotal: profitable.reduce((sum, s) => sum + s.total_pnl, 0),
        unprofitableTotal: unprofitable.reduce((sum, s) => sum + s.total_pnl, 0),
        focusOn: profitable.slice(0, 3).map(s => s.underlying),
        avoid: unprofitable.slice(-3).map(s => s.underlying),
      },
    });
  } catch (error) {
    console.error('Error fetching symbol performance:', error);
    return NextResponse.json({ error: 'Failed to fetch symbol performance' }, { status: 500 });
  }
}
