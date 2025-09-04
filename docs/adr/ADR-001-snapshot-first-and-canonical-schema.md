# ADR-001: Snapshot-first UI & Kanoniskt Schema

**Status:** Accepted  
**Date:** 2025-09-03

## Context
Live-API-anrop i UI ger sporadiska fel, långa svarstider och sämre reproducibilitet. Vi vill ha snabba appar och robust drift.

## Decision
1. **Snapshot-first UI**  
   Alla Streamlit-appar läser **endast** från Parquet-snapshots som byggs av separata scripts/loopar/Actions.
2. **Kanoniskt schema**  
   Snapshots ska följa ett överenskommet fältset (t.ex. Hotlists v1: `Symbol, Exchange, Last, NetPct, Rise{5,15,30,60}mPct, RangePct, RangePosPct, Open, High, Low, VolTot, LastTs, SnapshotAt`). Tidsfält är UTC.

## Consequences
- UI blir snabbt och stabilt, även vid API-störningar.  
- Beräkningslogik bor i snapshot-steget → lättare att testa.  
- Versionsbyte av schema sker via ADR och koordineras med UI.

## Notes
- Actions/PS-loopar uppdaterar snapshots med 1–5 min intervall (intradag).
- S3-prefix kan användas i moln för delning.
