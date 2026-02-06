import { Hono } from 'hono';
import { getStats, getWeekdayPerformance } from '../lib/queries';

const route = new Hono();

route.get('/', (c) => {
  try {
    const days = parseInt(c.req.query('days') || '30');
    const stats = getStats(days);
    const weekdays = getWeekdayPerformance();
    return c.json({ stats, weekdays });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

export default route;
