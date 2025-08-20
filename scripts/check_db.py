# scripts/check_db.py
import duckdb, os

DB_PATH = "./db/quant.duckdb"
con = duckdb.connect(DB_PATH)

print("DB:", os.path.abspath(DB_PATH))

cnt = con.execute("SELECT COUNT(*) FROM bars_all").fetchone()[0]
print("bars_all count:", cnt)

# Ta reda på kolumnnamn
schema = con.execute("DESCRIBE bars_all").df()
cols = [c.lower() for c in schema["column_name"].tolist()]
print("columns:", cols)

# Välj en tidskolumn som finns
for candidate in ["ts", "datetime", "date", "time", "timestamp"]:
    if candidate in cols:
        ts_col = candidate
        break
else:
    ts_col = None

if ts_col:
    df = con.execute(f'SELECT * FROM bars_all ORDER BY "{ts_col}" DESC LIMIT 5').df()
else:
    print("⚠️ Hittar ingen tidskolumn (ts/datetime/date/time/timestamp). Visar 5 rader utan sortering.")
    df = con.execute("SELECT * FROM bars_all LIMIT 5").df()

print(df)


