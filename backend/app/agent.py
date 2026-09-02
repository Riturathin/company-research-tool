import asyncio
import json
import re
from collections.abc import AsyncGenerator
from typing import Any

from .config import Settings
from .providers import LLMProvider, MockLLMProvider, MockSearchProvider, OpenRouterProvider, ProviderError, SearchProvider, SerperSearchProvider
from .schemas import Financials, Person, ReportData, SectionEvent, SectionName


SECTION_ORDER: list[SectionName] = ["overview", "key_people", "news", "financials", "risks"]


class InvalidCompanyName(ValueError):
    pass


def validate_company_name(company_name: str) -> str:
    cleaned = " ".join(company_name.strip().split())
    if len(cleaned) < 2 or not re.search(r"[A-Za-z0-9]", cleaned):
        raise InvalidCompanyName("Enter a real company name with letters or numbers.")
    if len(cleaned) > 160:
        raise InvalidCompanyName("Company name must be 160 characters or less.")
    return cleaned


class ResearchAgent:
    def __init__(self, search_provider: SearchProvider, llm_provider: LLMProvider):
        self.search_provider = search_provider
        self.llm_provider = llm_provider

    async def research(self, company_name: str) -> AsyncGenerator[SectionEvent, None]:
        data = ReportData()
        for section in SECTION_ORDER:
            yield SectionEvent(section=section, status="started")
            searches = await self._search_for_section(company_name, section)
            try:
                section_data = await self._synthesize_section(company_name, section, searches)
            except ProviderError:
                section_data = self._fallback_section(section)
            self._merge(data, section, section_data)
            yield SectionEvent(section=section, status="complete", data=getattr(data, section))
            await asyncio.sleep(0)
        yield SectionEvent(section="risks", status="complete", data=data)

    async def build_report_data(self, company_name: str) -> ReportData:
        data = ReportData()
        for section in SECTION_ORDER:
            searches = await self._search_for_section(company_name, section)
            section_data = await self._synthesize_section(company_name, section, searches)
            self._merge(data, section, section_data)
        return data

    async def _search_for_section(self, company_name: str, section: SectionName) -> list[dict[str, str]]:
        query_map = {
            "overview": f"{company_name} company overview products customers positioning",
            "key_people": f"{company_name} CEO CTO CFO CIO CISO leadership team",
            "news": f"{company_name} latest news acquisitions earnings product launches partnerships layoffs leadership changes",
            "financials": f"{company_name} revenue employee count market cap year over year growth",
            "risks": f"{company_name} regulatory scrutiny security breach litigation financial risk competitors",
        }
        return await self.search_provider.search(query_map[section], num_results=5)

    async def _synthesize_section(self, company_name: str, section: SectionName, search_results: list[dict[str, str]]) -> dict[str, Any]:
        system_prompt = (
            "You are a sales research analyst. Use only the supplied search snippets. "
            "Be concise, current, and practical for an Account Executive preparing for a meeting. "
            "Return strict JSON and use null for unavailable financial metrics."
        )
        user_prompt = f"""
Company: {company_name}
{{"section": "{section}"}}
Search results:
{json.dumps(search_results, ensure_ascii=False)}

Required JSON key:
- overview: string
- key_people: array of objects with name and title
- news: array of 3-4 concise bullets
- financials: object with revenue, employee_count, market_cap, yoy_growth
- risks: array of 2-3 concise bullets
Return only the key for the requested section.
"""
        return await self.llm_provider.complete_json(system_prompt, user_prompt)

    def _fallback_section(self, section: SectionName) -> dict[str, Any]:
        if section == "overview":
            return {"overview": "Overview unavailable because the model returned an invalid response."}
        if section == "key_people":
            return {"key_people": []}
        if section == "news":
            return {"news": ["Recent news unavailable because the model returned an invalid response."]}
        if section == "financials":
            return {"financials": {"revenue": None, "employee_count": None, "market_cap": None, "yoy_growth": None}}
        return {"risks": ["Risk factors unavailable because the model returned an invalid response."]}

    def _merge(self, data: ReportData, section: SectionName, payload: dict[str, Any]) -> None:
        value = payload.get(section)
        if section == "overview":
            data.overview = value if isinstance(value, str) else None
        elif section == "key_people":
            data.key_people = [Person.model_validate(person) for person in value or []]
        elif section == "news":
            data.news = [str(item) for item in value or []]
        elif section == "financials":
            data.financials = Financials.model_validate(value or {})
        elif section == "risks":
            data.risks = [str(item) for item in value or []]


def create_agent(settings: Settings) -> ResearchAgent:
    if settings.use_mocks:
        return ResearchAgent(MockSearchProvider(), MockLLMProvider())
    return ResearchAgent(SerperSearchProvider(settings), OpenRouterProvider(settings))
