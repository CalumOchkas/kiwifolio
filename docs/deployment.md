# Deployment Guide

## Docker Run

```bash
docker run -d \
  --name kiwifolio \
  -p 3000:3000 \
  -v ./data:/app/data \
  ghcr.io/calumochkas/kiwifolio:latest
```

The app will be available at [http://localhost:3000](http://localhost:3000).

On first run, if no database exists in `./data/`, a clean database with the correct schema is created automatically.

## Docker Compose

Create a `docker-compose.yml` (or download it from the repository):

```yaml
services:
  kiwifolio:
    image: ghcr.io/calumochkas/kiwifolio:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - DATABASE_URL=file:./data/kiwifolio.db
    restart: unless-stopped
```

Then run:

```bash
docker compose up -d
```

## Persistent Storage

Your SQLite database lives at `./data/kiwifolio.db` on the host machine (bind-mounted to `/app/data/kiwifolio.db` inside the container).

This means:
- Data survives container restarts and image upgrades.
- You can directly access, copy, or replace the database file on disk.
- Pre-restore backups (created automatically by the restore feature) are also stored in `./data/`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./data/kiwifolio.db` | SQLite database path. Should not need changing unless you move the data directory. |
| `PORT` | `3000` | Port the app listens on inside the container. |

## Upgrading

To upgrade to a new version:

```bash
# If using docker compose
docker compose pull
docker compose up -d

# If using docker run
docker pull ghcr.io/calumochkas/kiwifolio:latest
docker stop kiwifolio
docker rm kiwifolio
docker run -d \
  --name kiwifolio \
  -p 3000:3000 \
  -v ./data:/app/data \
  ghcr.io/calumochkas/kiwifolio:latest
```

Your database is preserved because it lives on the host in `./data/`.

## Backup

### Through the UI

Go to **Settings > Database > Download Backup**. This downloads the raw SQLite file as `kiwifolio-backup-YYYY-MM-DD.db`.

### On disk

Simply copy the database file:

```bash
cp ./data/kiwifolio.db ./kiwifolio-backup-$(date +%Y-%m-%d).db
```

## Restore

### Through the UI

Go to **Settings > Database > Restore from Backup** and upload a `.db` file. A backup of the current database is created automatically before overwriting. The app requires a restart after restore.

### On disk

```bash
# Stop the container
docker compose down  # or: docker stop kiwifolio

# Replace the database
cp /path/to/your-backup.db ./data/kiwifolio.db

# Restart
docker compose up -d  # or: docker start kiwifolio
```

## Adopting an Existing SQLite Backup

If you already have a KiwiFolio database from a previous installation:

1. Stop the container (if running).
2. Place your `.db` file at `./data/kiwifolio.db`.
3. Start the container — it will detect the existing database and use it directly (no initialization needed).

## Building from Source

To build the Docker image locally instead of pulling from GHCR:

```bash
git clone https://github.com/calumochkas/kiwifolio.git
cd kiwifolio
docker build -t kiwifolio .
docker run -d --name kiwifolio -p 3000:3000 -v ./data:/app/data kiwifolio
```

Or uncomment the `build` line in `docker-compose.yml`:

```yaml
services:
  kiwifolio:
    # image: ghcr.io/calumochkas/kiwifolio:latest
    build: .
    ...
```

Then run `docker compose up --build`.

## Container Image Tags

Published images use semantic versioning:

| Tag | Description |
|-----|-------------|
| `latest` | Most recent release |
| `0.1.0` | Specific version (immutable) |

Images are published to `ghcr.io/calumochkas/kiwifolio`.
