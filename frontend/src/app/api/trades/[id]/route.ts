import { NextResponse } from 'next/server';
import { getTradeById, updateTrade } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tradeId = parseInt(id, 10);
    if (isNaN(tradeId)) {
      return NextResponse.json({ error: 'Invalid trade ID' }, { status: 400 });
    }

    const trade = getTradeById(tradeId);
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json({ trade });
  } catch (error) {
    console.error('Error fetching trade:', error);
    return NextResponse.json({ error: 'Failed to fetch trade' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tradeId = parseInt(id, 10);
    if (isNaN(tradeId)) {
      return NextResponse.json({ error: 'Invalid trade ID' }, { status: 400 });
    }

    const body = await request.json();
    const { fields } = body;

    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'Missing fields object' }, { status: 400 });
    }

    // Recalculate P/L if price fields changed
    const recalcFields = { ...fields };
    const priceChanged = 'entry_price' in fields || 'exit_price' in fields
      || 'entry_amount' in fields || 'exit_amount' in fields || 'commission_total' in fields;

    if (priceChanged) {
      const current = getTradeById(tradeId);
      if (!current) {
        return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
      }

      const entryAmount = recalcFields.entry_amount ?? current.entry_amount ?? 0;
      const exitAmount = recalcFields.exit_amount ?? current.exit_amount ?? 0;
      const commission = recalcFields.commission_total ?? current.commission_total ?? 0;
      const entryPrice = recalcFields.entry_price ?? current.entry_price;
      const exitPrice = recalcFields.exit_price ?? current.exit_price;
      const quantity = recalcFields.quantity ?? current.quantity;

      recalcFields.gross_pnl = (exitPrice - entryPrice) * quantity * 100;
      recalcFields.net_pnl = exitAmount + entryAmount; // entryAmount is negative
      recalcFields.pnl_percent = entryPrice > 0 ? ((exitPrice / entryPrice) - 1) * 100 : 0;
    }

    // Recalculate hold time if times changed
    if ('entry_time' in fields || 'exit_time' in fields) {
      const current = getTradeById(tradeId);
      if (current) {
        const entryTime = recalcFields.entry_time ?? current.entry_time;
        const exitTime = recalcFields.exit_time ?? current.exit_time;
        if (entryTime && exitTime) {
          const [eh, em] = entryTime.split(':').map(Number);
          const [xh, xm] = exitTime.split(':').map(Number);
          recalcFields.hold_time_minutes = (xh * 60 + xm) - (eh * 60 + em);
        }
      }
    }

    const updated = updateTrade(tradeId, recalcFields);
    if (!updated) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json({ trade: updated });
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
  }
}
