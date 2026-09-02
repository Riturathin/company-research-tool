import json
import re
from abc import ABC, abstractmethod
from typing import Any

import httpx

from .config import Settings


class ProviderError(RuntimeError):
    pass


class SearchProvider(ABC):
    @abstractmethod
    async def search(self, query: str, *, num_results: int = 5) -> list[dict[str, str]]:
        raise NotImplementedError


class LLMProvider(ABC):
    @abstractmethod
    async def complete_json(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        raise NotImplementedError


class SerperSearchProvider(SearchProvider):
    def __init__(self, settings: Settings):
        if not settings.serper_api_key:
            raise ProviderError("SERPER_API_KEY is required when USE_MOCKS=false.")
        self.api_key = settings.serper_api_key

    async def search(self, query: str, *, num_results: int = 5) -> list[dict[str, str]]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": self.api_key, "Content-Type": "application/json"},
                json={"q": query, "num": num_results},
            )
        raise_for_service_error(response, "Serper")
        payload = response.json()
        organic = payload.get("organic", [])
        return [
            {
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "link": item.get("link", ""),
            }
            for item in organic[:num_results]
        ]


class OpenRouterProvider(LLMProvider):
    def __init__(self, settings: Settings):
        if not settings.openrouter_api_key:
            raise ProviderError("OPENROUTER_API_KEY is required when USE_MOCKS=false.")
        self.api_key = settings.openrouter_api_key
        self.model = settings.openrouter_model
        self.http_referer = settings.openrouter_http_referer
        self.app_title = settings.openrouter_app_title

    async def complete_json(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.http_referer:
            headers["HTTP-Referer"] = self.http_referer
        if self.app_title:
            headers["X-OpenRouter-Title"] = self.app_title

        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
        raise_for_service_error(response, "OpenRouter")
        content = response.json()["choices"][0]["message"]["content"]
        return parse_json_response(content)


def raise_for_service_error(response: httpx.Response, service_name: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = response.text.strip()
        if len(detail) > 500:
            detail = detail[:500]
        raise ProviderError(f"{service_name} error {response.status_code}: {detail}") from exc


def parse_json_response(content: str) -> dict[str, Any]:
    candidates = [content.strip()]
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if fenced:
        candidates.append(fenced.group(1).strip())
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(content[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    raise ProviderError("The LLM returned a response that could not be parsed as JSON.")


class MockSearchProvider(SearchProvider):
    async def search(self, query: str, *, num_results: int = 5) -> list[dict[str, str]]:
        return [
            {
                "title": f"{query} - company update",
                "snippet": "Recent reporting highlights product expansion, executive priorities, and customer demand.",
                "link": "https://example.com/company-update",
            },
            {
                "title": f"{query} - financial profile",
                "snippet": "Public sources summarize revenue scale, headcount estimates, and growth indicators.",
                "link": "https://example.com/financial-profile",
            },
            {
                "title": f"{query} - risk context",
                "snippet": "Analysts note competitive pressure, regulatory exposure, and execution risk.",
                "link": "https://example.com/risk-context",
            },
        ][:num_results]


class MockLLMProvider(LLMProvider):
    async def complete_json(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        company = user_prompt.split("Company:", 1)[-1].split("\n", 1)[0].strip() or "the company"
        if '"section": "overview"' in user_prompt:
            return {
                "overview": (
                    f"{company} is positioned as a growth-oriented business serving enterprise and mid-market "
                    "customers with a mix of software, services, and partner-led delivery. For a sales rep, the key "
                    "conversation angle is operational efficiency, stakeholder alignment, and measurable business impact."
                )
            }
        if '"section": "key_people"' in user_prompt:
            return {"key_people": [{"name": "Sample CEO", "title": "Chief Executive Officer"}, {"name": "Sample CTO", "title": "Chief Technology Officer"}]}
        if '"section": "news"' in user_prompt:
            return {"news": ["Announced a new product initiative aimed at enterprise customers.", "Expanded a strategic partnership to reach more market segments.", "Recent coverage points to continued investment in go-to-market growth."]}
        if '"section": "financials"' in user_prompt:
            return {"financials": {"revenue": None, "employee_count": "1,000-5,000 estimated", "market_cap": None, "yoy_growth": None}}
        return {"risks": ["Competitive pressure may affect pricing and differentiation.", "Private-company financials may be limited or outdated.", "Execution risk exists around recent growth initiatives."]}
