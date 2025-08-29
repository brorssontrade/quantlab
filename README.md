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



## Köra datasynk i GitHub Actions (cron)

Detta repo har två workflows som sköter datainhämtning automatiskt:

- **Data Sync (intraday)** – körs var 5:e minut på vardagar och hämtar 5-min bars för tickers i `watchlist.yaml`. Respekterar market hours.
- **Data Sync (EOD)** – körs en gång per vardag efter US-stäng och uppdaterar dagliga bars.

### Hur funkar cachen?

Cachefiler (CSV) ligger under `data/cache/eodhd` men **på en separat branch** som heter `data`.
Workflows checkar först ut `data`-branchen, läser in cachen, kör inkrementell synk, och pushar tillbaka ändrade CSV:er.
På så vis blir varje körning snabb och du slipper ladda ner historik igen.

### Kom igång

1. **Lägg in API-nyckeln**
   - Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*
   - Name: `EODHD_API_KEY`  
     Value: *din EODHD token*

2. **Ge GITHUB_TOKEN skriv-rättigheter**
   - Repo → *Settings* → *Actions* → *General* → *Workflow permissions* → välj **Read and write permissions**.
   - (Workflown sätter också `permissions: contents: write`, men globala rättigheter måste tillåta skrivning.)

3. **Pusha watchlist och workflows**
   - Se till att `watchlist.yaml` finns på `main`.
   - Workflown “Data Sync (intraday)” skapar automatiskt `data`-branch första gången om den saknas.

4. **Manuell körning & felsökning**
   - Fliken *Actions* → välj workflow → *Run workflow*.
   - Loggar visar hur många nya rader per symbol.
   - Cachefiler: växla till branchen **`data`** i GitHub och öppna `data/cache/eodhd/…csv`.

### Vanliga justeringar

- Ändra tidtabeller i `.github/workflows/data_intraday.yml` och `data_eod.yml` (`cron` är i **UTC**).
- Ändra intervall/dagar genom att uppdatera CLI-flaggorna i *Run … sync*-steget.
- Lägg till/ta bort tickers i `watchlist.yaml`, ingen annan ändring krävs.





## Apps

- 🔥 **Hot Lists** – kortsiktigt momentum, gap, returer, trend/volatilitet.
- 📊 **Breadth** – adv/dec, 52w highs/lows, enkel marknadsbredd.

Körs som multipage på Streamlit. Startfil: `streamlit_app.py`.

### Data
EOD och 5m Parquet synkas till S3 av GitHub Actions:
- `.github/workflows/data_intraday_us.yml`
- `.github/workflows/data_intraday_st.yml`
- (valfritt) `data_eod.yml`

Secrets som behövs: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`.



## Apps
- 🔥 **Hot Lists** — [Streamlit](https://<din-app-URL>.streamlit.app)
