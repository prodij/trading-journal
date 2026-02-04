import { NextResponse } from 'next/server';
import { getEquityCurve } from '@/lib/db';

export async function GET() {
  try {
    const equity = getEquityCurve();
    return NextResponse.json({ equity });
  } catch (error) {
    console.error('Error fetching equity:', error);
    return NextResponse.json({ error: 'Failed to fetch equity' }, { status: 500 });
  }
}
