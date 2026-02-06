import { Hono } from 'hono';

const route = new Hono();

route.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    runtime: 'bun',
    bun: Bun.version,
  });
});

export default route;
