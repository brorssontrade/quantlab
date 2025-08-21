[![Charts](https://img.shields.io/badge/Charts-gh--pages-blue)](https://brorssontrade.github.io/quantlab/)


[![📊 Live charts](https://img.shields.io/badge/📊%20Live%20charts-gh--pages-blue)](https://brorssontrade.github.io/quantlab/)



![CI](https://github.com/brorssontrade/quantlab/actions/workflows/ci.yml/badge.svg)
[![Charts (GitHub Pages)](https://img.shields.io/badge/Charts-LIVE-2ea44f?logo=github)](https://brorssontrade.github.io/quantlab/)



# quantlab
Pipeline: hämta kursdata (yfinance) → lagra i DuckDB → plotta → rapporter.

## Quickstart (Windows)

```powershell
# klona
git clone https://github.com/brorssontrade/quantlab.git
cd quantlab

# skapa & aktivera venv (Python 3.12)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# installera
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install matplotlib yfinance

# hämta lite data, initiera DB, och plotta
mkdir storage\parquet\raw_1h -ea 0
mkdir db -ea 0
python .\cli_live.py --symbol ABB.ST --interval 1h --days 60
python .\scripts\init_duckdb.py
python .\scripts\plot_symbol.py --symbol ABB.ST --days 60


![CI](https://github.com/brorssontrade/quantlab/actions/workflows/ci.yml/badge.svg)

[![Charts (GitHub Pages)](https://img.shields.io/badge/Charts-LIVE-2ea44f?logo=github)](https://brorssontrade.github.io/quantlab/)

