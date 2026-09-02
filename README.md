# Company Research Tool

A full-stack take-home implementation of a sales briefing tool. A user enters a company name, the backend researches the company using live Google Search results, an LLM synthesizes the findings, and the frontend streams a structured report section by section.

The app is designed for Account Executives and Sales Development Reps who need a fast, readable briefing before a call.

## Features

- Search input with button and Enter support
- Progressive report rendering with Server-Sent Events
- Five report sections: company overview, key people, recent news, financial highlights, and risk factors
- Report history sidebar with company name and relative timestamp
- Click-to-load saved reports
- Delete saved reports
- Empty, loading, error, complete, and invalid-input states
- Cancel in-progress research
- Cmd/Ctrl+K shortcut to focus search
- Responsive layout
- Duplicate in-progress research prevention for the same company
- Partial report saving if one or more sections fail
- Automatic retry for failed sections when a saved report is opened

## Tech Stack

- Backend: Python, FastAPI, Pydantic, SQLAlchemy
- Frontend: React, TypeScript, Vite
- Database: SQLite
- LLM provider: OpenRouter Chat Completions API
- Search provider: Serper Google Search API
- Streaming: Server-Sent Events

## Provider Choices

OpenRouter is used for LLM access because it offers an OpenAI-compatible Chat Completions API while allowing the model to be changed through configuration. The default model is `openrouter/free` so the project can be tested without requiring paid OpenRouter credits, though stronger paid models will generally produce more reliable structured JSON.

Serper is used for live Google Search because the assignment requires Google Search results. The search implementation is isolated behind a provider class, so another Google-compatible search provider could be swapped in without changing the API or frontend.

## Environment Variables

Copy the example file:

```bash
cp backend/.env.example backend/.env
```

For mock mode, no API keys are required:

```env
OPENROUTER_API_KEY=
SERPER_API_KEY=
USE_MOCKS=true
OPENROUTER_MODEL=openrouter/free
OPENROUTER_HTTP_REFERER=http://localhost:5173
OPENROUTER_APP_TITLE=Company Research Tool
DATABASE_URL=sqlite:///./company_research.db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

For live mode, add your own keys and set `USE_MOCKS=false`:

```env
OPENROUTER_API_KEY=your_openrouter_key
SERPER_API_KEY=your_serper_key
USE_MOCKS=false
OPENROUTER_MODEL=openrouter/free
OPENROUTER_HTTP_REFERER=http://localhost:5173
OPENROUTER_APP_TITLE=Company Research Tool
DATABASE_URL=sqlite:///./company_research.db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Do not commit `backend/.env` or real API keys.

## Run Locally

Start the backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

## API

`POST /api/research`

Starts company research and streams progress through SSE. A report record is created at the start so partial results can still appear in history.

`GET /api/reports`

Lists saved reports, newest first.

`GET /api/reports/{id}`

Returns a saved report with all section data.

`DELETE /api/reports/{id}`

Deletes a saved report.

`POST /api/reports/{id}/sections/{section}/retry`

Retries one failed section and updates the saved report.

`GET /api/health`

Health check endpoint.

## SSE Events

The research endpoint streams these events:

```text
event: report
data: {"report_id":123}

event: section
data: {"section":"overview","status":"started","data":null,"message":null}

event: section
data: {"section":"overview","status":"complete","data":"...","message":null}

event: complete
data: {"report_id":123}
```

If a section fails, the report still completes with fallback data and a section-level message. If the full stream fails because of a provider or network issue, the frontend shows a human-readable error instead of a stack trace.

## Tests

Backend:

```bash
cd backend
source .venv/bin/activate
python -m pytest
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

The tests cover API behavior, report persistence, invalid input, JSON parsing, partial section failure handling, empty UI state, frontend invalid-input behavior, error normalization, and missing-data defaults.

## Design Decisions And Trade-Offs

- SQLite is used as requested, keeping the project simple and easy to run locally.
- The backend uses provider adapters for search and LLM calls so external APIs can be mocked cleanly in tests.
- Research sections run concurrently to reduce total wait time while the UI still displays sections in the required order.
- The frontend consumes the SSE response as a readable stream and updates the UI as each section changes state.
- Missing financial fields stay `null` and render as unavailable rather than being fabricated.
- Partial reports are saved so one flaky section does not discard useful research.
- Errors are normalized into concise user-facing messages instead of exposing provider exception text.
- Mock mode is available for reviewers who do not want to configure keys, but the live Serper and OpenRouter code paths are fully implemented.

## Not Included

The assignment explicitly marks these as out of scope, so they are not included:

- Authentication or login
- PDF export
- Dark mode or themes
- Pagination
- WebSockets
- Docker
- CI/CD
- Elaborate monitoring or logging

## With More Time

I would improve source citation quality by storing URLs and snippets beside each generated claim, add stronger company/entity disambiguation for ambiguous names, add end-to-end browser tests for the full SSE flow, introduce retry/backoff policies per provider, and add a small report freshness indicator so reps can quickly tell when a briefing should be regenerated.
