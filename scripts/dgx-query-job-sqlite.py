#!/usr/bin/env python3
import sqlite3
import sys

job_id = sys.argv[1] if len(sys.argv) > 1 else ""
db = "/home/sifr/3DAIGC-API/data/job_queue.db"
conn = sqlite3.connect(db)
if job_id:
    row = conn.execute(
        "SELECT job_id, status, feature FROM jobs WHERE job_id = ?",
        (job_id,),
    ).fetchone()
    print(row if row else "NOT_IN_SQLITE")
else:
    for row in conn.execute("SELECT job_id, status, feature FROM jobs LIMIT 5"):
        print(row)
