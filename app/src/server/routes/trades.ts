import { Hono } from 'hono';
import { getTrades, getDailySummaries, getTradeById, updateTrade, getDistinctUnderlyings } from '../lib/queries';

const route = new Hono();

// GET / — list trades with pagination and filters
route.get('/', (c) => {
  try {
    const dateFrom = c.req.query('dateFrom') || undefined;
    const dateTo = c.req.query('dateTo') || undefined;
    const underlying = c.req.query('underlying') || undefined;
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const { trades, total } = getTrades({ dateFrom, dateTo, underlying, limit, offset });
    const totalPages = Math.ceil(total / limit);
    const summaries = getDailySummaries(30);
    const underlyings = getDistinctUnderlyings();

    return c.json({ trades, summaries, total, page, totalPages, underlyings });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return c.json({ error: 'Failed to fetch trades' }, 500);
  }
});

// GET /:id — single trade detail
route.get('/:id', (c) => {
  try {
    const tradeId = parseInt(c.req.param('id'), 10);
    if (isNaN(tradeId)) {
      return c.json({ error: 'Invalid trade ID' }, 400);
    }

    const trade = getTradeById(tradeId);
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404);
    }

    return c.json({ trade });
  } catch (error) {
    console.error('Error fetching trade:', error);
    return c.json({ error: 'Failed to fetch trade' }, 500);
  }
});

// PATCH /:id — update trade fields
route.patch('/:id', async (c) => {
  try {
    const tradeId = parseInt(c.req.param('id'), 10);
    if (isNaN(tradeId)) {
      return c.json({ error: 'Invalid trade ID' }, 400);
    }

    const body = await c.req.json();
    const { fields } = body;

    if (!fields || typeof fields !== 'object') {
      return c.json({ error: 'Missing fields object' }, 400);
    }

    // Recalculate P/L if price fields changed
    const recalcFields = { ...fields };
    const priceChanged = 'entry_price' in fields || 'exit_price' in fields
      || 'entry_amount' in fields || 'exit_amount' in fields || 'commission_total' in fields;

    if (priceChanged) {
      const current = getTradeById(tradeId);
      if (!current) {
        return c.json({ error: 'Trade not found' }, 404);
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
      return c.json({ error: 'Trade not found' }, 404);
    }

    return c.json({ trade: updated });
  } catch (error) {
    console.error('Error updating trade:', error);
    return c.json({ error: 'Failed to update trade' }, 500);
  }
});

export default route;
