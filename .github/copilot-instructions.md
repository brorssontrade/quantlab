# QuantLab – AI Assistant Instructions

> Golden template for AI assistants (GitHub Copilot, Claude, etc.)  
> working on the QuantLab repository.
>
> **Version:** See `git log -1 --format="%h %ci" -- .github/copilot-instructions.md`

---

## 🚀 Bootstrap Rule (READ FIRST)

**Before writing ANY code, read these files in order:**

1. `docs/LLM.md` – Architecture overview, UI map, run commands
2. `docs/LLM_TASKS.md` – Task backlog, what's done, what's in progress
3. `docs/FILE_INDEX.md` – Where to find code (~300 files indexed)
4. `docs/APP_WALKTHROUGH_REPORT.md` – UI tabs analysis (16 tabs with status)

```powershell
# Quick context load
Get-Content docs/LLM.md, docs/LLM_TASKS.md | Select-Object -First 200
```

---

## ✅ Definition of Done (Non-Negotiables)

A task is **NOT done** until ALL of these are true:

| Check | Command | Must Pass |
|-------|---------|-----------|
| Backend tests | `pytest tests/ -v` | ✅ All green |
| Frontend build | `cd quantlab-ui && npm run build` | ✅ No errors |
| Playwright (if UI changed) | `cd quantlab-ui && npx playwright test` | ✅ Relevant specs pass |
| Docs updated | See table below | ✅ Same commit |

### Docs Update Matrix

| If you changed... | Update these docs |
|-------------------|-------------------|
| Architecture/API | `docs/LLM.md` |
| Completed a task | `docs/LLM_TASKS.md` (mark DONE with date) |
| Added/moved files | `docs/FILE_INDEX.md` |
| UI tab behavior | `docs/APP_WALKTHROUGH_REPORT.md` |
| Known bug found | `docs/roadmap/KNOWN_ISSUES.md` |
| ChartsPro QA | `docs/chartspro/QA_CHARTSPRO.md` |

### No Silent TODOs

If something must be deferred:
```markdown
**Deferred:** <what>
**Reason:** <why>
**Next step:** <exact action for next dev>
**Logged in:** LLM_TASKS.md as T-XXX
```

---

## 🧪 Standard Commands

### Backend

```powershell
# Setup
cd quantlab
$env:EODHD_API_KEY = "your-key"
$env:PYTHONPATH = "$PWD\src"

# Run server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Run tests
pytest tests/ -v --tb=short

# Type check (if needed)
mypy app/ --ignore-missing-imports
```

### Frontend

```powershell
cd quantlab-ui

# Install deps
npm install

# Dev server (port 5173)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Type check
npx tsc --noEmit

# Playwright tests
npx playwright test --project=chromium

# Single spec
npx playwright test tests/chartsPro.cp2.spec.ts --project=chromium
```

### CI Monitoring

```powershell
# Day 2 check (post-release validation)
python scripts/monitoring/day2_check.py

# Day 3 check (ongoing health)
$env:RUN_UI_SMOKE = "1"
python scripts/monitoring/day3_check.py
```

---

## 📝 Commit & PR Discipline

### Commit Message Format

```
type(scope): short description

Types: feat, fix, docs, style, refactor, test, chore
Scope: backend, frontend, engine, ci, docs, chartspro
```

**Examples:**
```
feat(frontend): add empty state to Fundamentals tab
fix(backend): handle missing EODHD key gracefully
docs(llm): update UI map with new tab statuses
test(chartspro): add CP8 legend parity spec
```

### PR Description Template

```markdown
## What changed
- Brief list of changes

## How to test
1. Step-by-step verification
2. Include commands if needed

## Docs updated
- [ ] LLM.md (if architecture)
- [ ] LLM_TASKS.md (task logged)
- [ ] FILE_INDEX.md (if files added)
- [ ] APP_WALKTHROUGH_REPORT.md (if UI changed)

## Risks
- Any edge cases or known limitations
```

---

## 📁 File Ownership Rules

| Path | Purpose | Owner |
|------|---------|-------|
| `app/` | FastAPI backend | Backend |
| `app/routers/` | API endpoints | Backend |
| `quantlab-ui/src/` | React frontend | Frontend |
| `quantlab-ui/src/features/` | Feature modules | Frontend |
| `quantlab-ui/tests/` | Playwright E2E | Frontend |
| `engine/` | Backtest engine | Engine |
| `scripts/` | CLI tools, monitoring | Ops |
| `config/` | YAML configs | Config |
| `docs/` | All documentation | Docs |
| `.github/workflows/` | CI/CD | DevOps |

### Where to put new files

| Type | Location |
|------|----------|
| New API endpoint | `app/routers/<domain>.py` |
| New React feature | `quantlab-ui/src/features/<name>/` |
| New Playwright test | `quantlab-ui/tests/<feature>.spec.ts` |
| New CLI script | `scripts/<name>.py` |
| New config | `config/<name>.yml` |

---

## ⚠️ Common Pitfalls

### Windows-Specific
- **ALWAYS** set `$env:PYTHONPATH = "$PWD\src"` before running Python
- uvicorn `--reload` may need `--reload-delay 2` on slow file systems
- Use `npx playwright install chromium` if browser missing

### Testing
- Use `?mock=1` URL param for deterministic ChartsPro tests
- Access QA API via `window.__lwcharts.dump()`, `window.__lwcharts.set()`
- See `docs/chartspro/QA_CHARTSPRO.md` for full contract

### Git
- Don't commit files in `storage/`, `data/`, `node_modules/` (git-ignored)
- Don't hardcode API keys – use environment variables
- Run `npm run build` before pushing frontend changes

---

## 🔗 Quick Reference

```
quantlab/
├── app/                    # FastAPI backend
│   ├── main.py            # Entry point
│   └── routers/           # API endpoints
├── quantlab-ui/           # React frontend
│   ├── src/App.tsx        # Main app (16 tabs)
│   ├── src/features/      # Feature modules
│   └── tests/             # Playwright specs
├── engine/                # Backtest engine
├── scripts/               # CLI tools
├── config/                # YAML configs
├── docs/                  # Documentation
│   ├── LLM.md            # 👈 Start here
│   ├── LLM_TASKS.md      # Task tracking
│   ├── FILE_INDEX.md     # File reference
│   └── APP_WALKTHROUGH_REPORT.md
└── tests/                 # Backend pytest
```

---

## 📋 Checklist Before Submitting

```markdown
- [ ] Read docs/LLM.md first
- [ ] pytest tests/ -v passes
- [ ] npm run build succeeds
- [ ] Playwright tests pass (if UI changed)
- [ ] Docs updated in same commit
- [ ] No silent TODOs (all deferred items logged)
- [ ] Commit message follows convention
- [ ] PR description filled out
```
