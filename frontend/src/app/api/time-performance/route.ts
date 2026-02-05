import { NextResponse } from 'next/server';
import { getHourlyPerformance, getSessionPerformance } from '@/lib/db';

export async function GET() {
  try {
    const hourly = getHourlyPerformance();
    const sessions = getSessionPerformance();

    // Calculate insight: best cutoff time
    let bestCutoff = null;
    if (hourly.length > 0) {
      // Find hour after which cumulative P/L starts declining
      let cumulativePnl = 0;
      let maxPnl = 0;
      let bestHour = 9;

      for (const h of hourly) {
        cumulativePnl += h.total_pnl;
        if (cumulativePnl > maxPnl) {
          maxPnl = cumulativePnl;
          bestHour = h.hour;
        }
      }

      // Calculate how much would be saved by stopping at bestHour
      const afterBestHour = hourly
        .filter(h => h.hour > bestHour)
        .reduce((sum, h) => sum + h.total_pnl, 0);

      if (afterBestHour < 0) {
        bestCutoff = {
          hour: bestHour,
          savedAmount: Math.abs(afterBestHour),
        };
      }
    }

    return NextResponse.json({
      hourly,
      sessions,
      insight: bestCutoff,
    });
  } catch (error) {
    console.error('Error fetching time performance:', error);
    return NextResponse.json({ error: 'Failed to fetch time performance' }, { status: 500 });
  }
}
