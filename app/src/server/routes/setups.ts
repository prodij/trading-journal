import { Hono } from 'hono';
import { getSetupPerformance } from '../lib/queries';

const route = new Hono();

route.get('/', (c) => {
  try {
    const setups = getSetupPerformance();
    return c.json({ setups });
  } catch (error) {
    console.error('Error fetching setups:', error);
    return c.json({ error: 'Failed to fetch setups' }, 500);
  }
});

export default route;
