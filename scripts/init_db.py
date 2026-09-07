#!/usr/bin/env python3
"""
Database initialization script.
Reads migrations/001_initial_schema.sql and applies it to DATABASE_URL.
"""
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MIGRATION_FILE = BASE_DIR / "migrations" / "001_initial_schema.sql"

def init_postgres(database_url: str):
    import psycopg2
    print(f"[DB] Connecting to PostgreSQL...")
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    with conn.cursor() as cur:
        sql = MIGRATION_FILE.read_text(encoding="utf-8")
        cur.execute(sql)
    conn.close()
    print("[DB] Schema applied successfully!")

def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("[DB WARNING] DATABASE_URL environment variable is not set.")
        print("Usage: DATABASE_URL='postgresql://user:password@host/dbname' python scripts/init_db.py")
        sys.exit(1)
    
    try:
        init_postgres(db_url)
    except Exception as e:
        print(f"[DB ERROR] Failed to apply schema: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
