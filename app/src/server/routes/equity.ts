import { Hono } from 'hono';
import { getEquityCurve } from '../lib/queries';

const route = new Hono();

route.get('/', (c) => {
  try {
    const equity = getEquityCurve();
    return c.json({ equity });
  } catch (error) {
    console.error('Error fetching equity:', error);
    return c.json({ error: 'Failed to fetch equity' }, 500);
  }
});

export default route;
