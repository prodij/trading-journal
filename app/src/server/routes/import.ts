import { Hono } from 'hono';
import { getDb } from '../db';
import { importCsv } from '../lib/import';

const route = new Hono();

route.post('/', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (!file.name.endsWith('.csv')) return c.json({ error: 'File must be a .csv' }, 400);

  try {
    const csvContent = await file.text();
    const result = importCsv(getDb(), csvContent);

    return c.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      message: `Imported ${result.imported} executions (${result.skipped} duplicates skipped)`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    return c.json({ error: message }, 500);
  }
});

export default route;
