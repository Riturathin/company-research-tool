import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .agent import InvalidCompanyName, create_agent, validate_company_name
from .config import get_settings
from .database import get_db, init_db
from .errors import duplicate_research_error, invalid_input_error, provider_error
from .repository import create_report, delete_report, get_report, list_reports
from .schemas import ReportData, ResearchRequest


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Company Research Tool", lifespan=lifespan)
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_active_companies: set[str] = set()
_active_lock = asyncio.Lock()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/reports")
def reports(db: Session = Depends(get_db)):
    return list_reports(db)


@app.get("/api/reports/{report_id}")
def report(report_id: int, db: Session = Depends(get_db)):
    item = get_report(db, report_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return item


@app.delete("/api/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_report(report_id: int, db: Session = Depends(get_db)):
    if not delete_report(db, report_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")


@app.post("/api/research")
async def research(request: ResearchRequest, db: Session = Depends(get_db)):
    try:
        company_name = validate_company_name(request.company_name)
    except InvalidCompanyName as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=invalid_input_error(str(exc))) from exc

    company_key = company_name.casefold()
    async with _active_lock:
        if company_key in _active_companies:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=duplicate_research_error())
        _active_companies.add(company_key)

    async def event_stream():
        report_data = ReportData()
        agent = create_agent(settings)
        try:
            async for event in agent.research(company_name):
                if isinstance(event.data, ReportData):
                    report_data = event.data
                    continue
                if event.status == "complete" and event.data is not None:
                    setattr(report_data, event.section, event.data)
                yield f"event: section\ndata: {event.model_dump_json()}\n\n"
            saved = create_report(db, company_name, report_data)
            yield f"event: complete\ndata: {json.dumps({'report_id': saved.id})}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps(provider_error(exc))}\n\n"
        finally:
            async with _active_lock:
                _active_companies.discard(company_key)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
