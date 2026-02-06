import { Hono } from 'hono';
import { getDb } from '../db';
import { importPaste } from '../lib/paste-import';

const route = new Hono();

route.post('/', async (c) => {
  const body = await c.req.json<{ text?: string }>();

  if (!body.text || typeof body.text !== 'string') {
    return c.json({ error: 'Missing "text" field in request body' }, 400);
  }

  if (body.text.trim().length === 0) {
    return c.json({ error: 'Paste content is empty' }, 400);
  }

  try {
    const result = importPaste(getDb(), body.text);

    const parts: string[] = [];
    if (result.updated > 0) parts.push(`${result.updated} timestamps added`);
    if (result.inserted > 0) parts.push(`${result.inserted} new executions`);
    if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);

    return c.json({
      success: true,
      updated: result.updated,
      inserted: result.inserted,
      skipped: result.skipped,
      message: parts.length > 0 ? parts.join(', ') : 'No changes made',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paste import failed';
    return c.json({ error: message }, 500);
  }
});

export default route;
