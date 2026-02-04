import { NextResponse } from 'next/server';
import { getSetupPerformance } from '@/lib/db';

export async function GET() {
  try {
    const setups = getSetupPerformance();
    return NextResponse.json({ setups });
  } catch (error) {
    console.error('Error fetching setups:', error);
    return NextResponse.json({ error: 'Failed to fetch setups' }, { status: 500 });
  }
}
