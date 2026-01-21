# Windows Development Guide

> **Purpose:** Windows-specific pitfalls, workarounds, and best practices  
> **Last Updated:** 2025-01-15

---

## 1. Quick Start on Windows

### Prerequisites
- Python 3.11+ (via Anaconda or pyenv-win)
- Node.js 18+ (via nvm-windows or direct install)
- Git for Windows (with Git Bash)
- VS Code with Python and ESLint extensions

### Backend Startup
```powershell
# Set environment variables
$env:EODHD_API_KEY = "your-key-here"
$env:PYTHONPATH = "$PWD\src"

# Start FastAPI
cd c:\path\to\quantlab
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend Startup
```powershell
cd c:\path\to\quantlab\quantlab-ui
npm install
npm run dev
```

---

## 2. PYTHONPATH Issues

### Problem
Windows doesn't automatically include `src/` in the Python path. Import errors like:
```
ModuleNotFoundError: No module named 'quantkit'
```

### Solution
Always set PYTHONPATH before running Python scripts:

```powershell
# PowerShell
$env:PYTHONPATH = "$PWD\src;$PWD"

# Or in .env file for uvicorn
PYTHONPATH=./src:.
```

### CI Workflow Fix
In GitHub Actions, use:
```yaml
env:
  PYTHONPATH: ${{ github.workspace }}/src
```

---

## 3. Uvicorn Hot Reload Issues

### Problem
`uvicorn --reload` may fail or behave erratically on Windows due to:
- File system watcher (watchfiles/watchgod) limitations
- Antivirus interference
- Long path names

### Symptoms
- Changes not detected
- Multiple restarts in rapid succession
- "Too many open files" errors

### Solutions

**1. Use polling mode (slower but reliable):**
```powershell
python -m uvicorn app.main:app --reload --reload-dir app --reload-delay 2
```

**2. Exclude problematic directories:**
```powershell
# Create pyproject.toml section:
[tool.uvicorn]
reload_excludes = ["*.pyc", "__pycache__", ".git", "node_modules", "storage", "data"]
```

**3. Use Python's built-in watchdog:**
```powershell
pip install watchdog
python -m uvicorn app.main:app --reload --reload-include "*.py"
```

**4. Disable Windows Defender real-time scanning for project folder:**
- Windows Security → Virus & threat protection → Manage settings
- Add exclusion for `C:\path\to\quantlab`

---

## 4. Path Length Limits

### Problem
Windows has a 260-character path limit by default. Deep `node_modules` paths can fail.

### Solution
Enable long paths in Windows:

```powershell
# Run as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Or configure Git:
```bash
git config --system core.longpaths true
```

---

## 5. Line Endings (CRLF vs LF)

### Problem
Git may convert line endings, causing issues with shell scripts and linting.

### Solution
Configure Git for consistent handling:

```bash
# Checkout as-is, commit as LF
git config --global core.autocrlf input

# Or use .gitattributes (recommended)
* text=auto eol=lf
*.bat text eol=crlf
*.ps1 text eol=crlf
```

---

## 6. Shell Script Execution

### Problem
`.sh` scripts don't run natively on Windows.

### Solutions

**Option 1: Git Bash**
```bash
# Right-click → Git Bash Here
./scripts/my_script.sh
```

**Option 2: WSL2**
```bash
wsl ./scripts/my_script.sh
```

**Option 3: Create PowerShell equivalent**
For critical scripts, maintain both `.sh` and `.ps1` versions:
- `scripts/run_breadth_loop.sh` → `scripts/run_breadth_loop.ps1`

---

## 7. Port Conflicts

### Problem
Port 8000 or 5173 already in use.

### Diagnosis
```powershell
# Find process using port 8000
netstat -ano | findstr :8000
# Kill by PID
taskkill /PID <PID> /F
```

### Solution
Or use alternative ports:
```powershell
python -m uvicorn app.main:app --port 8001
npm run dev -- --port 5174
```

---

## 8. SSL/Certificate Issues

### Problem
`pip install` or `npm install` fails with certificate errors behind corporate proxies.

### Solution
```powershell
# For pip
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org package-name

# For npm
npm config set strict-ssl false
```

---

## 9. Playwright on Windows

### Installation
```powershell
cd quantlab-ui
npm install
npx playwright install chromium
```

### Headed Test Mode
```powershell
npx playwright test --headed --project=chromium
```

### Common Issues

**Browser not found:**
```powershell
npx playwright install --with-deps chromium
```

**WebSocket timeout:**
Increase timeout in `playwright.config.ts`:
```typescript
timeout: 60000,
expect: { timeout: 10000 },
```

---

## 10. Environment Variables Best Practices

### Session-only (PowerShell)
```powershell
$env:EODHD_API_KEY = "your-key"
$env:LLM_MODEL = "llama3.1:8b"
```

### Persistent (User level)
```powershell
[Environment]::SetEnvironmentVariable("EODHD_API_KEY", "your-key", "User")
```

### Using .env files
Create `.env` in project root:
```ini
EODHD_API_KEY=your-key
LLM_MODEL=llama3.1:8b
PYTHONPATH=./src:.
```

Load with python-dotenv:
```python
from dotenv import load_dotenv
load_dotenv()
```

---

## 11. Self-Hosted GitHub Runner

### Labels Required
The QuantLab CI expects:
```yaml
runs-on: [self-hosted, Windows, X64, quantlab-local]
```

### Setup
1. Download runner from GitHub repo → Settings → Actions → Runners
2. Configure as Windows Service (auto-start)
3. Ensure runner has access to Python and Node.js
4. Set workspace cleanup policy

### Troubleshooting
```powershell
# Check runner status
.\run.cmd status

# View logs
Get-Content .\log.txt -Tail 100

# Restart service
Restart-Service "actions.runner.*"
```

---

## 12. Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `cannot find module 'quantkit'` | PYTHONPATH not set | `$env:PYTHONPATH = "$PWD\src"` |
| `ENOENT: no such file or directory` | Long path or missing file | Enable long paths; check path spelling |
| `EPERM: operation not permitted` | Antivirus or file lock | Add exclusion; close other editors |
| `EADDRINUSE: address already in use` | Port conflict | Kill process or use different port |
| `SSL: CERTIFICATE_VERIFY_FAILED` | Corporate proxy | Use `--trusted-host` flag |
| `watchfiles: no directory watching` | watchfiles issue | Use `--reload-delay 2` |

---

## Related Documents

- [LLM.md](../LLM.md) – Main project context
- [FILE_INDEX.md](../FILE_INDEX.md) – File structure reference
- [MONITORING.md](./MONITORING.md) – CI/CD monitoring setup
