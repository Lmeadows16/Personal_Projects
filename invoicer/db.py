# db.py
import sqlite3
from pathlib import Path
from typing import Optional, List, Dict, Any
from settings import DB_PATH

def get_conn() -> sqlite3.Connection:
    Path("data").mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        client_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS invoices (
        invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        client_id INTEGER NOT NULL,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        notes TEXT,
        tax_rate REAL NOT NULL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'Unpaid',
        pdf_path TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(client_id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS invoice_items (
        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        qty REAL NOT NULL,
        unit_price REAL NOT NULL,
        category TEXT NOT NULL,  -- labor/material/misc
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS counters (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
    )
    """)

    # Initialize invoice counter if missing
    cur.execute("INSERT OR IGNORE INTO counters(key, value) VALUES('invoice_seq', 0)")

    conn.commit()
    conn.close()

def create_client(name: str, phone: str, email: str, address: str) -> int:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO clients(name, phone, email, address) VALUES (?, ?, ?, ?)",
        (name, phone, email, address),
    )
    conn.commit()
    client_id = cur.lastrowid
    if client_id is None:
        conn.close()
        raise RuntimeError("Failed to obtain last row id from INSERT")
    conn.close()
    return int(client_id)

def list_clients() -> List[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM clients ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_client(client_id: int) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM clients WHERE client_id=?", (client_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def next_invoice_number(year: int) -> str:
    """
    Generates invoice numbers like 2026-00001.
    Counter increments globally; format includes current year for readability.
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE counters SET value = value + 1 WHERE key='invoice_seq'")
    cur.execute("SELECT value FROM counters WHERE key='invoice_seq'")
    seq = cur.fetchone()["value"]
    conn.commit()
    conn.close()
    return f"{year}-{seq:05d}"

def create_invoice(invoice_number: str, client_id: int, issue_date: str, due_date: str, notes: str, tax_rate: float) -> int:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO invoices(invoice_number, client_id, issue_date, due_date, notes, tax_rate)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (invoice_number, client_id, issue_date, due_date, notes, tax_rate))
    conn.commit()
    invoice_id = cur.lastrowid
    conn.close()
    assert invoice_id is not None, "Failed to insert invoice"
    return invoice_id

def add_item(invoice_id: int, description: str, qty: float, unit_price: float, category: str) -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO invoice_items(invoice_id, description, qty, unit_price, category)
        VALUES (?, ?, ?, ?, ?)
    """, (invoice_id, description, qty, unit_price, category))
    conn.commit()
    conn.close()

def get_invoice_with_items(invoice_id: int) -> Dict[str, Any]:
    conn = get_conn()
    cur = conn.cursor()
    inv = cur.execute("SELECT * FROM invoices WHERE invoice_id=?", (invoice_id,)).fetchone()
    items = cur.execute("SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY item_id", (invoice_id,)).fetchall()
    client = cur.execute("SELECT * FROM clients WHERE client_id=?", (inv["client_id"],)).fetchone()
    conn.close()
    return {
        "invoice": dict(inv),
        "client": dict(client),
        "items": [dict(r) for r in items],
    }

def set_invoice_pdf_path(invoice_id: int, pdf_path: str) -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE invoices SET pdf_path=? WHERE invoice_id=?", (pdf_path, invoice_id))
    conn.commit()
    conn.close()
