import { Hono } from 'hono';

const route = new Hono();

route.get('/', (c) => {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localeStr = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(now);

  return c.json({
    iso: now.toISOString(),
    epochMs: now.getTime(),
    timezone: tz,
    tzOffsetMinutes: -now.getTimezoneOffset(),
    locale: localeStr,
  });
});

export default route;
