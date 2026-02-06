import { Hono } from 'hono';
import {
  getBiggestLosses,
  getLossPatternsByHour,
  getLossPatternsByDay,
  getHoldTimeComparison,
} from '../lib/queries';

const route = new Hono();

route.get('/', (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const losses = getBiggestLosses(limit);
    const byHour = getLossPatternsByHour();
    const byDay = getLossPatternsByDay();
    const holdTime = getHoldTimeComparison();

    // Find worst hour and worst day
    const worstHour = byHour.length > 0 ? byHour[0] : null;
    const worstDay = byDay.length > 0 ? byDay[0] : null;

    return c.json({
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
    return c.json({ error: 'Failed to fetch losses' }, 500);
  }
});

export default route;
