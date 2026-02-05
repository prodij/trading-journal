import { NextResponse } from 'next/server';
import {
  getBiggestLosses,
  getLossPatternsByHour,
  getLossPatternsByDay,
  getHoldTimeComparison,
} from '@/lib/db';

export async function GET() {
  try {
    const losses = getBiggestLosses(20);
    const byHour = getLossPatternsByHour();
    const byDay = getLossPatternsByDay();
    const holdTime = getHoldTimeComparison();

    // Find worst hour and worst day
    const worstHour = byHour.length > 0 ? byHour[0] : null;
    const worstDay = byDay.length > 0 ? byDay[0] : null;

    return NextResponse.json({
      losses,
      patterns: {
        byHour,
        byDay,
        holdTime,
        worstHour,
        worstDay,
      },
    });
  } catch (error) {
    console.error('Error fetching losses:', error);
    return NextResponse.json({ error: 'Failed to fetch losses' }, { status: 500 });
  }
}
