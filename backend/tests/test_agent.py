import pytest

from app.agent import ResearchAgent
from app.providers import LLMProvider, SearchProvider


class StaticSearchProvider(SearchProvider):
    async def search(self, query: str, *, num_results: int = 5) -> list[dict[str, str]]:
        return [{"title": "Result", "snippet": "Snippet", "link": "https://example.com"}]


class FailingOverviewProvider(LLMProvider):
    async def complete_json(self, system_prompt: str, user_prompt: str):
        if '"section": "overview"' in user_prompt:
            raise RuntimeError("bad model response")
        if '"section": "key_people"' in user_prompt:
            return {"key_people": [{"name": "Ada Lovelace", "title": "CEO"}]}
        if '"section": "news"' in user_prompt:
            return {"news": ["Launched a new product."]}
        if '"section": "financials"' in user_prompt:
            return {"financials": {"revenue": None, "employee_count": "100", "market_cap": None, "yoy_growth": None}}
        return {"risks": ["Competitive pressure."]}


@pytest.mark.anyio
async def test_agent_preserves_partial_report_when_one_section_fails():
    agent = ResearchAgent(StaticSearchProvider(), FailingOverviewProvider())
    events = [event async for event in agent.research("Acme")]
    final_data = events[-1].data

    assert final_data.section_errors["overview"]
    assert final_data.key_people[0].name == "Ada Lovelace"
    assert final_data.news == ["Launched a new product."]
