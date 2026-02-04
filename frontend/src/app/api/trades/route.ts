import { NextResponse } from 'next/server';
import { getTrades, getDailySummaries } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    
    const trades = getTrades(date);
    const summaries = getDailySummaries(30);
    
    return NextResponse.json({ trades, summaries });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}
