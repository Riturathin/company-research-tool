from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SectionName = Literal["overview", "key_people", "news", "financials", "risks"]


class ResearchRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=160)


class Person(BaseModel):
    name: str
    title: str


class Financials(BaseModel):
    revenue: str | None = None
    employee_count: str | None = None
    market_cap: str | None = None
    yoy_growth: str | None = None


class ReportData(BaseModel):
    overview: str | None = None
    key_people: list[Person] = Field(default_factory=list)
    news: list[str] = Field(default_factory=list)
    financials: Financials = Field(default_factory=Financials)
    risks: list[str] = Field(default_factory=list)
    section_errors: dict[SectionName, str] = Field(default_factory=dict)


class ReportSummary(BaseModel):
    id: int
    company_name: str
    created_at: datetime


class ReportDetail(ReportSummary):
    data: ReportData


class SectionEvent(BaseModel):
    section: SectionName
    status: Literal["started", "complete", "error"]
    data: object | None = None
    message: str | None = None
