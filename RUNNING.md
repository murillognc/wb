# Running WaterBrain

The dashboard in `project/` is now backed by a real backend (`backend/`) that
talks to Claude via the **Claude Agent SDK**. The backend serves the dashboard
*and* the API, so you run one thing.

## 1. Start it

```bash
cd backend
./run.sh            # first run creates a venv + installs deps; serves on :8000
```

## 2. Configure the key (once)

Open **http://localhost:8000**, click the **⚙ gear** (top-right), paste your
Anthropic API key, and Save. The key is stored server-side in `backend/.env`
and never reaches the browser. (You can also pre-set it by copying
`backend/.env.example` to `backend/.env`.)

## 3. Use it

Pick a specialist on the left (WaterBrain, Financeiro, Comercial, Operacional,
PDCA) and chat. Replies stream live from Claude Opus 4.6 with extended thinking,
1M context, and prompt caching always on — see `backend/README.md` for the full
behaviour parity table with the v9.2 pipe and what the Agent SDK does / doesn't
expose.
