# Deployment Guide

## Local Development

```bash
cd frontend
pnpm install
pnpm dev
# Open http://localhost:3001
```

## Docker (Local)

```bash
# Build and run
docker-compose up --build

# Open http://localhost:3000
```

## Coolify Deployment

### 1. Add Application in Coolify

1. Go to Coolify dashboard → Projects → Add Resource
2. Select **Docker Compose**
3. Connect to GitHub repo: `prodij/trading-journal`
4. Branch: `main`

### 2. Configure Build

- **Build Pack:** Docker Compose
- **Docker Compose Location:** `/docker-compose.yml`
- **Port:** 3000

### 3. Configure Volumes

Add persistent volume for the database:
- **Source:** `/data/trading-journal`
- **Target:** `/app/data`

### 4. Environment Variables

No required environment variables for basic setup.

Optional:
```
NODE_ENV=production
```

### 5. Domain

Set your domain (e.g., `journal.yourdomain.com`)

### 6. Deploy

Click Deploy. Coolify will:
1. Clone the repo
2. Build the Docker image
3. Start the container
4. Set up SSL via Let's Encrypt

## Importing Trades

### Option 1: SSH into server
```bash
# Copy CSV to server
scp ~/Downloads/etrade.csv user@server:/data/trading-journal/

# Run import via Docker
docker exec trading-journal python /app/src-py/journal.py import /app/data/etrade.csv
```

### Option 2: Local import, sync DB
```bash
# Import locally
python src/journal.py import ~/Downloads/etrade.csv

# Copy DB to server
scp data/journal.db user@server:/data/trading-journal/
```

## Updating

Push to GitHub → Coolify auto-deploys (if webhook configured) or manually redeploy from dashboard.
