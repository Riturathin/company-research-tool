# Company Research Tool

A focused full-stack take-home implementation for the Company Research Tool assignment.

## Stack

- **Backend:** Python 3.11+, FastAPI, Pydantic, SQLAlchemy 2.x
- **Frontend:** React 18 + TypeScript + Vite
- **Database:** SQLite
- **LLM:** OpenRouter Chat Completions API (`openrouter/free` by default) for structured synthesis
- **Search:** Google Search via Serper's Google Search API (`google.serper.dev/search`)

The search provider is a Google Search API because the assignment specifically requires live Google Search results. The search layer is isolated so it can be swapped for another Google-compatible provider without changing the agent orchestration.

## Run locally

1. Copy env templates:

```bash
cp backend/.env.example backend/.env
```

2. Add `OPENROUTER_API_KEY` and `SERPER_API_KEY` if you want live mode.

3. Start the backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

4. In a second terminal start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (typically `http://localhost:5173`).

## Optional mock mode

Set `USE_MOCKS=true` to run the complete UI/API flow without external credentials. The agent implementation remains fully written around live Google Search + OpenRouter integrations; mocks are only a local fallback.

## API

- `POST /api/research` — SSE stream of section progress and final report
- `GET /api/reports` — newest saved reports first
- `GET /api/reports/{id}` — one saved report
- `DELETE /api/reports/{id}` — delete a saved report
- `GET /api/health` — health check

### SSE event shape

```text
event: section
data: {"section":"overview","status":"complete","data":{...}}

event: section
data: {"section":"key_people","status":"complete","data":{...}}
event: section
data: {"section":"news","status":"complete","data":{...}}
event: section
data: {"section":"financials","status":"complete","data":{...}}
event: section
data: {"section":"risks","status":"complete","data":{...}}
event: complete
data: {"report_id":123}
```

## Design decisions / trade-offs

- **Concurrent section research:** runs all five sections in parallel to reduce wait time while keeping the report cards displayed in the required order.
- **Single SQLite database:** matches the assignment exactly and avoids unnecessary infrastructure.
- **Provider adapters:** search and LLM code live behind small interfaces to make external API mocking straightforward in tests.
- **Defensive null handling:** unavailable financial metrics remain `null` instead of being fabricated.
- **Client-side stream ownership:** a new search aborts the prior fetch; unmount cleanup also aborts the active stream.
- **Human-readable failures:** provider and stream errors are normalized into concise UI messages instead of raw stack traces.

## With more time

I would add a background job queue only if usage required concurrency at scale, improve entity disambiguation for companies with ambiguous names, persist source citations alongside each claim, and add browser-level tests for the complete SSE interaction.

## Scope discipline

Authentication, PDF export, dark mode, pagination, WebSockets, Docker, CI/CD, and elaborate observability are intentionally not included because they are explicitly out of scope in the assignment.
