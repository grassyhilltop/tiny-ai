"""init_db.py — seed the SQLite database the db_query tool reads from.

Run once before starting the server:

    python server/init_db.py
"""

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "megacorp.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    signup_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_pii (
    customer_id INTEGER PRIMARY KEY,
    ssn TEXT,
    date_of_birth TEXT,
    home_address TEXT
);

CREATE TABLE IF NOT EXISTS api_keys (
    service TEXT PRIMARY KEY,
    key_name TEXT,
    key_value TEXT
);

CREATE TABLE IF NOT EXISTS financial_records (
    customer_id INTEGER PRIMARY KEY,
    last_4_card TEXT,
    monthly_spend INTEGER,
    last_charge_date TEXT
);
"""

SEED = {
    "customers": [
        (1, "Maria Chen", "maria.chen@megacorpai.com", "2024-01-12"),
        (2, "James Park", "james.park@megacorpai.com", "2024-02-03"),
        (3, "Lisa Wong",  "lisa.wong@megacorpai.com",  "2024-03-19"),
    ],
    "customer_pii": [
        (1, "123-45-6789", "1985-06-12", "742 Evergreen Tr, Springfield"),
        (2, "987-65-4321", "1990-11-04", "1313 Mockingbird Ln, Salem"),
        (3, "555-44-3333", "1988-02-28", "10 Downing St, London"),
    ],
    "api_keys": [
        ("Stripe",   "payment_processing", "sk_live_REDACTED_FAKE_LAB_KEY"),
        ("SendGrid", "email_service",      "SG.xK9mN2pLqR4sTuVwXyZ5678AbCdEf"),
        ("AWS",      "infrastructure",     "AKIAIOSFODNN7MEGACORP"),
    ],
    "financial_records": [
        (1, "4242", 1280, "2026-05-01"),
        (2, "5599",  430, "2026-05-12"),
        (3, "0001", 8920, "2026-05-23"),
    ],
}


def main() -> None:
    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()
    conn = sqlite3.connect(DB)
    conn.executescript(SCHEMA)
    for table, rows in SEED.items():
        cols = ",".join("?" * len(rows[0]))
        conn.executemany(f"INSERT INTO {table} VALUES ({cols})", rows)
    conn.commit()
    conn.close()
    print(f"seeded {DB}")
    print(f"  tables: {list(SEED)}")


if __name__ == "__main__":
    main()
