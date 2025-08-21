# scripts/init_duckdb.py
import duckdb, os
os.makedirs("db", exist_ok=True)
DB = "./db/quant.duckdb"
con = duckdb.connect(DB)

con.execute("""
CREATE OR REPLACE VIEW bars_all AS
SELECT 
  ts::TIMESTAMPTZ AS ts,
  COALESCE(symbol, regexp_extract(filename, 'symbol=([^/\\\\]+)', 1)) AS symbol,
  open, high, low, close, volume
FROM read_parquet('./storage/parquet/raw_1h/**', filename=true, hive_partitioning=true, union_by_name=true)
WHERE ts IS NOT NULL
""")

rows = con.execute("SELECT COUNT(*) FROM bars_all").fetchone()[0]
print(f"DuckDB init -> {DB}")
print(f"bars_all rows: {rows}")
print(con.execute("DESCRIBE SELECT * FROM bars_all LIMIT 1").df())
