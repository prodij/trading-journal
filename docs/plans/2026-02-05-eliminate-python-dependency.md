# Migrate to Bun + Hono + Vite Stack

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Next.js + better-sqlite3 + Python with Bun + Hono + Vite + React. Keep shadcn/ui, Tailwind, Recharts. Eliminate all native compilation. Docker image from 2.6GB to ~100MB.

**Architecture:**
```
E*Trade CSV → Hono API (Bun) → bun:sqlite → SQLite
                                    ↓
                        Vite + React + shadcn/ui (static build)
```

Single Bun process serves both the API and the static frontend.

**Tech Stack:**
- Runtime: Bun (built-in SQLite via `bun:sqlite`)
- API: Hono (14KB)
- Frontend: Vite + React 19 + shadcn/ui + Tailwind 4 + Recharts
- Database: SQLite via `bun:sqlite` (no native compilation)

**Why each piece:**
| Tech | Why | What it replaces |
|------|-----|-----------------|
| Bun | Built-in SQLite, fast runtime, no native deps | Node.js + better-sqlite3 + python3/make/g++ |
| Hono | 14KB router, standard Web API, middleware | Next.js API routes (155MB) |
| Vite | Fast dev server, builds static assets | Next.js build system |
| React + shadcn/ui | Component library with good design | Stays the same |
| Recharts | Charts | Stays the same |

---

### Task 1: Scaffold Bun + Hono + Vite project

Create the new project structure alongside the existing `frontend/` directory.

**New structure:**
```
app/
  src/
    client/          # React frontend (moved from frontend/src)
      app/
      components/
      lib/
    server/          # Hono API
      routes/
      lib/
    shared/          # Types shared between client/server
  public/
  schema.sql         # Moved from src/schema.sql
  package.json
  tsconfig.json
  vite.config.ts
  bunfig.toml
```

**Step 1: Init project**

```bash
mkdir -p app/src/{client,server/routes,server/lib,shared}
cd app
bun init -y
```

**Step 2: Install dependencies**

```bash
bun add hono react react-dom recharts radix-ui class-variance-authority clsx tailwind-merge lucide-react
bun add -d vite @vitejs/plugin-react tailwindcss @tailwindcss/postcss @tailwindcss/vite @types/react @types/react-dom typescript tw-animate-css
```

**Step 3: Configure Vite**

`app/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/client') },
  },
  build: {
    outDir: 'dist/client',
  },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
```

**Step 4: Configure TypeScript**

`app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/client/*"] }
  },
  "include": ["src"]
}
```

**Step 5: Commit**

```bash
git add app/
git commit -m "feat: scaffold Bun + Hono + Vite project structure"
```

---

### Task 2: Create Hono server with bun:sqlite

**Files:**
- Create: `app/src/server/db.ts`
- Create: `app/src/server/index.ts`
- Copy: `src/schema.sql` → `app/schema.sql`

**Step 1: Database layer with bun:sqlite**

`app/src/server/db.ts`:
```typescript
import { Database } from 'bun:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const DB_DIR = join(import.meta.dir, '../../../data');
const DB_PATH = join(DB_DIR, 'journal.db');

let db: Database | null = null;

function initSchema(database: Database): void {
  const hasTable = database.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='executions'"
  ).get();
  if (hasTable) return;

  const schemaPath = join(import.meta.dir, '../../schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

export function getDb(): Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode=WAL');
    initSchema(db);
  }
  return db;
}
```

**Step 2: Hono server entry point**

`app/src/server/index.ts`:
```typescript
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

const app = new Hono();

// API routes (added in subsequent tasks)
// app.route('/api', apiRoutes);

// Serve static frontend (Vite build output)
app.use('/*', serveStatic({ root: './dist/client' }));

// SPA fallback
app.get('/*', serveStatic({ root: './dist/client', path: 'index.html' }));

export default {
  port: Number(process.env.PORT || 3000),
  fetch: app.fetch,
};
```

**Step 3: Commit**

```bash
git add app/src/server/ app/schema.sql
git commit -m "feat: add Hono server with bun:sqlite and schema auto-init"
```

---

### Task 3: Port import logic to Bun

Port CSV parsing, FIFO matching, daily summary from Python. Same logic as the existing plan but using `bun:sqlite` API instead of `better-sqlite3`.

**Files:**
- Create: `app/src/server/lib/import.ts`
- Create: `app/src/server/routes/import.ts`

**Step 1: Import logic**

Port `parseOccSymbol()`, `parseTradeDate()`, `parseCsv()`, `calculateRoundTrips()`, `calculateDailySummary()`, and `importCsv()` to `app/src/server/lib/import.ts`.

The logic is identical to the previous plan — only the DB API changes slightly:
- `db.prepare(...).run(...)` → `db.query(...).run(...)`
- `db.prepare(...).all(...)` → `db.query(...).all(...)`
- `db.prepare(...).get(...)` → `db.query(...).get(...)`
- `db.transaction(fn)` → `db.transaction(fn)`

**Step 2: Import API route**

`app/src/server/routes/import.ts`:
```typescript
import { Hono } from 'hono';
import { getDb } from '../db';
import { importCsv } from '../lib/import';

const route = new Hono();

route.post('/', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (!file.name.endsWith('.csv')) return c.json({ error: 'File must be a .csv' }, 400);

  const csvContent = await file.text();
  const result = importCsv(getDb(), csvContent);

  return c.json({
    success: true,
    imported: result.imported,
    skipped: result.skipped,
    message: `Imported ${result.imported} executions (${result.skipped} duplicates skipped)`,
  });
});

export default route;
```

**Step 3: Commit**

```bash
git add app/src/server/lib/ app/src/server/routes/
git commit -m "feat: port CSV import, FIFO matching, daily summary to Bun"
```

---

### Task 4: Port all API routes from Next.js to Hono

Port each Next.js API route to a Hono route. The SQL queries stay identical — only the response wrapper changes.

**Files:**
- Create: `app/src/server/routes/trades.ts`
- Create: `app/src/server/routes/stats.ts`
- Create: `app/src/server/routes/equity.ts`
- Create: `app/src/server/routes/setups.ts`
- Create: `app/src/server/routes/losses.ts`
- Create: `app/src/server/routes/time-performance.ts`
- Create: `app/src/server/routes/symbol-performance.ts`
- Create: `app/src/server/routes/health.ts`
- Modify: `app/src/server/index.ts` (register all routes)

**Pattern per route** (example: trades):

```typescript
// Next.js (old):
import { NextResponse } from 'next/server';
export async function GET() {
  const data = getTrades();
  return NextResponse.json(data);
}

// Hono (new):
import { Hono } from 'hono';
const route = new Hono();
route.get('/', (c) => c.json(getTrades()));
export default route;
```

Port the DB query functions from `frontend/src/lib/db.ts` into `app/src/server/lib/queries.ts`, switching from `better-sqlite3` to `bun:sqlite` API.

**Step: Register routes in index.ts**

```typescript
import importRoute from './routes/import';
import tradesRoute from './routes/trades';
import statsRoute from './routes/stats';
// ... etc

app.route('/api/import', importRoute);
app.route('/api/trades', tradesRoute);
app.route('/api/stats', statsRoute);
// ... etc
```

**Commit:**

```bash
git add app/src/server/
git commit -m "feat: port all API routes from Next.js to Hono"
```

---

### Task 5: Move React frontend to Vite

Move the existing React components from `frontend/src/` to `app/src/client/`. The components stay nearly identical — only framework-specific imports change.

**Files:**
- Copy: `frontend/src/app/page.tsx` → `app/src/client/App.tsx`
- Copy: `frontend/src/components/` → `app/src/client/components/`
- Copy: `frontend/src/lib/utils.ts` → `app/src/client/lib/utils.ts`
- Create: `app/src/client/main.tsx` (Vite entry)
- Create: `app/index.html` (Vite HTML shell)

**Step 1: Create Vite entry point**

`app/src/client/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`app/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trading Journal</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/client/main.tsx"></script>
</body>
</html>
```

**Step 2: Move and adapt components**

The main changes from Next.js → Vite:
- Remove `"use client"` directives (everything is client-side now)
- Remove `next/font` usage — use CSS `@font-face` or CDN
- Replace any `next/image` with regular `<img>` tags
- API calls stay the same (`fetch('/api/trades')` etc.)

**Step 3: Copy Tailwind config and global styles**

Move `frontend/src/app/globals.css` → `app/src/client/globals.css`

**Step 4: Commit**

```bash
git add app/src/client/ app/index.html
git commit -m "feat: move React frontend to Vite, remove Next.js dependencies"
```

---

### Task 6: Create lightweight Dockerfile

**Files:**
- Create: `Dockerfile` (replace existing)
- Modify: `docker-compose.yml`

**Step 1: Write Dockerfile**

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY app/package.json app/bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source
COPY app/ .

# Build frontend
RUN bun run vite build

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000
ENV PORT=3000

CMD ["bun", "run", "src/server/index.ts"]
```

No python3, no make, no g++, no native compilation.

**Step 2: Update docker-compose.yml**

```yaml
services:
  trading-journal:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "4000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "bun", "--eval", "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
```

**Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: lightweight Dockerfile with Bun (no native compilation)"
```

---

### Task 7: Clean up old stack and update docs

**Files:**
- Delete: `frontend/` directory
- Delete: `src/` directory
- Modify: `CLAUDE.md`
- Modify: `docker-compose.coolify.yml`
- Modify: `.github/workflows/build.yml`

**Step 1: Remove old directories**

```bash
rm -rf frontend/ src/
```

**Step 2: Update CLAUDE.md**

- Architecture: `E*Trade CSV → Hono API (Bun) → bun:sqlite → Vite + React`
- Dev commands: `cd app && bun dev` (Vite dev server) + `bun run src/server/index.ts` (API)
- Remove all Python references
- Update key files table
- Update tech stack

**Step 3: Update CI workflow**

Update `.github/workflows/build.yml` — the Docker build context stays the same, just builds faster.

**Step 4: Update Coolify compose**

Point to the new image (same GHCR path, new build).

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Next.js + Python, update docs for Bun + Hono stack"
```

---

### Task 8: Test end-to-end

**Step 1: Local dev test**

```bash
rm -f data/journal.db
cd app && bun run src/server/index.ts &
bun run vite dev
```

1. Open http://localhost:5173 (Vite dev server, proxies API to :3000)
2. Upload CSV — verify import works
3. Verify all dashboard tabs render
4. Edit a trade — verify save works

**Step 2: Docker test**

```bash
docker-compose down -v
docker-compose up --build
```

1. Verify build completes (should be fast — no compilation)
2. Check image size: `docker images | grep trading-journal`
3. Upload CSV at http://localhost:4000
4. Verify all functionality

**Step 3: Commit any fixes**

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Docker image | 2.6GB | ~100MB |
| Build time | ~3-5 min | ~30s |
| Runtime deps | Node.js + Python3 + native C++ | Bun only |
| node_modules | 652MB | ~100MB (no native addons) |
| Languages | Python + TypeScript | TypeScript only |
| Frontend DX | Same shadcn/ui + Recharts | Same shadcn/ui + Recharts |
