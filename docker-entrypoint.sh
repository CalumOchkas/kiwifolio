#!/bin/sh
set -e

# First-run: if no database exists, copy the clean bootstrap DB
if [ ! -f /app/data/kiwifolio.db ]; then
  echo "No database found — initializing a fresh database..."
  cp /app/data/kiwifolio.db.init /app/data/kiwifolio.db
  echo "Database initialized at /app/data/kiwifolio.db"
fi

exec node server.js
