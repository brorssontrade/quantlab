# scripts/init_duckdb.py
import os
import duckdb
import glob
import re
import pandas as pd

DB_PATH = "./db/quant.duckdb"
RAW_1H = "./storage/parquet/raw_1h/*.parquet"
RAW_1M = "./storage/parquet/raw_1m/*.parquet"

os.makedirs("./db", exist_ok=True)

con = duckdb.connect(DB_PATH)

def make_view(pattern: str, view: str):
    files = glob.glob(pattern)
    if not files:
        # Tom vy om inga filer ännu
        con.execute(f"""
            CREATE OR REPLACE VIEW {view} AS
            SELECT CAST(NULL AS TIMESTAMPTZ) AS ts,
                   CAST(NULL AS VARCHAR)     AS symbol,
                   CAST(NULL AS DOUBLE)      AS open,
                   CAST(NULL AS DOUBLE)      AS high,
                   CAST(NULL AS DOUBLE)      AS low,
                   CAST(NULL AS DOUBLE)      AS close,
                   CAST(NULL AS DOUBLE)      AS volume
            WHERE 1=0;
        """)
        return 0

    # Bygg vy: läs alla filer (union_by_name), extrahera symbol från filnamn om kolumnen saknas/tom
    con.execute(f"""
        CREATE OR REPLACE VIEW {view} AS
        WITH src AS (
            SELECT *
            FROM read_parquet('{pattern.replace('\\', '/')}', filename=true, union_by_name=true)
        ), norm AS (
            SELECT
                CAST(ts AS TIMESTAMPTZ) AS ts,
                UPPER(
                    COALESCE(
                        NULLIF(TRIM(symbol), ''),
                        REGEXP_EXTRACT(filename, '([^/\\\\]+)\\.parquet$', 1)
                    )
                ) AS symbol,
                CAST(open   AS DOUBLE) AS open,
                CAST(high   AS DOUBLE) AS high,
                CAST(low    AS DOUBLE) AS low,
                CAST(close  AS DOUBLE) AS close,
                CAST(volume AS DOUBLE) AS volume
            FROM src
        )
        SELECT ts, symbol, open, high, low, close, volume
        FROM norm
        WHERE ts IS NOT NULL;
    """)
    n = con.execute(f"SELECT COUNT(*) FROM {view}").fetchone()[0]
    cols = [r[0] for r in con.execute(f"DESCRIBE {view}").fetchall()]
    print(f"[{view}] rader: {n} | kolumner: {cols}")
    return n

print(f"DuckDB init -> {os.path.abspath(DB_PATH)}")

rows_1h = make_view(RAW_1H, "bars_raw_1h")
rows_1m = make_view(RAW_1M, "bars_raw_1m")

# Sammanlagd vy
con.execute("""
    CREATE OR REPLACE VIEW bars_all AS
    SELECT * FROM bars_raw_1h
    UNION ALL
    SELECT * FROM bars_raw_1m;
""")

total = con.execute("SELECT COUNT(*) FROM bars_all").fetchone()[0]
print(f"bars_all rows: {total}")

# Visa schema snabbt
print(con.execute("DESCRIBE bars_all").df())

# Visa 5 senaste med symbol så vi ser att symbol är korrekt
df_head = con.execute("""
    SELECT ts, symbol, open, high, low, close, volume
    FROM bars_all
    ORDER BY ts DESC
    LIMIT 5
""").df()
print(df_head)
