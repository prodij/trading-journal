import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import importRoute from './routes/import';
import tradesRoute from './routes/trades';
import statsRoute from './routes/stats';
import equityRoute from './routes/equity';
import setupsRoute from './routes/setups';
import lossesRoute from './routes/losses';
import timePerformanceRoute from './routes/time-performance';
import symbolPerformanceRoute from './routes/symbol-performance';
import healthRoute from './routes/health';
import edgeRoute from './routes/edge';
import serverTimeRoute from './routes/server-time';

const app = new Hono();

// CORS for dev (Vite on different port)
app.use('/api/*', cors());

// API routes
app.route('/api/health', healthRoute);
app.route('/api/import', importRoute);
app.route('/api/trades', tradesRoute);
app.route('/api/stats', statsRoute);
app.route('/api/equity', equityRoute);
app.route('/api/setups', setupsRoute);
app.route('/api/losses', lossesRoute);
app.route('/api/time-performance', timePerformanceRoute);
app.route('/api/symbol-performance', symbolPerformanceRoute);
app.route('/api/edge', edgeRoute);
app.route('/api/server-time', serverTimeRoute);

// Serve static frontend (Vite build output)
app.use('/*', serveStatic({ root: './dist/client' }));

// SPA fallback
app.get('/*', serveStatic({ root: './dist/client', path: 'index.html' }));

export default {
  port: Number(process.env.PORT || 3000),
  fetch: app.fetch,
};
