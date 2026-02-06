import { Hono } from 'hono';
import {
  getBiggestWins,
  getWinPatternsByHour,
  getWinPatternsByDay,
  getHoldTimeComparison,
} from '../lib/queries';

const route = new Hono();

route.get('/', (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const wins = getBiggestWins(limit);
    const byHour = getWinPatternsByHour();
    const byDay = getWinPatternsByDay();
    const holdTime = getHoldTimeComparison();

    // Find best hour and best day
    const bestHour = byHour.length > 0 ? byHour[0] : null;
    const bestDay = byDay.length > 0 ? byDay[0] : null;

    return c.json({
      wins,
      patterns: {
        byHour,
        byDay,
        holdTime,
        bestHour,
        bestDay,
      },
    });
  } catch (error) {
    console.error('Error fetching wins:', error);
    return c.json({ error: 'Failed to fetch wins' }, 500);
  }
});

export default route;
