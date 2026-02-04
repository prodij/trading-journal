import { NextResponse } from 'next/server';
import { getStats, getWeekdayPerformance } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    
    const stats = getStats(days);
    const weekdays = getWeekdayPerformance();
    
    return NextResponse.json({ stats, weekdays });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
