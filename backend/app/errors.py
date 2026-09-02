from typing import Any

from .providers import ProviderError


def user_error(title: str, points: list[str]) -> dict[str, Any]:
    return {"title": title, "points": points}


def invalid_input_error(message: str) -> dict[str, Any]:
    return user_error("Check the company name", [message, "Try a recognizable company name such as Microsoft, Stripe, or Google."])


def duplicate_research_error() -> dict[str, Any]:
    return user_error("Research already in progress", ["This company is already being researched.", "Wait for the current briefing to finish or cancel it before starting again."])


def provider_error(exc: Exception) -> dict[str, Any]:
    message = str(exc)
    lower = message.lower()
    if "openrouter" in lower and "402" in lower:
        return user_error("OpenRouter needs billing or a free model", ["Your OpenRouter request reached the provider, but the selected model is not available on your current plan.", "Add credits in OpenRouter or set OPENROUTER_MODEL=openrouter/free in backend/.env.", "Restart the backend after changing environment variables."])
    if "openrouter" in lower and "404" in lower:
        return user_error("OpenRouter model was not found", ["The configured OpenRouter model name is not valid for your account.", "Use OPENROUTER_MODEL=openrouter/free for free local testing.", "Restart the backend after updating backend/.env."])
    if "openrouter" in lower and ("401" in lower or "403" in lower):
        return user_error("OpenRouter key was rejected", ["Check that OPENROUTER_API_KEY is present in backend/.env.", "Make sure the key was copied without quotes, spaces, or placeholder characters.", "Restart the backend after saving the key."])
    if "serper" in lower and ("401" in lower or "403" in lower):
        return user_error("Serper key was rejected", ["Check that SERPER_API_KEY is present in backend/.env.", "Copy only the value shown beside X-API-KEY from Serper.", "Restart the backend after saving the key."])
    if "serper" in lower and ("402" in lower or "429" in lower):
        return user_error("Serper search limit reached", ["The Google Search provider rejected the request because of quota or billing limits.", "Check your Serper dashboard for available credits.", "Try again after quota is restored."])
    if "could not be parsed as json" in lower or "malformed json" in lower:
        return user_error("The model returned an unreadable response", ["The search succeeded, but the selected model did not return valid structured data.", "Try again, or use a stronger OpenRouter model for more reliable JSON output.", "Any completed sections before this point are still shown on screen."])
    if "nodename nor servname" in lower or "name or service not known" in lower or "network" in lower:
        return user_error("Network request failed", ["The backend could not reach the external provider.", "Check your internet connection and provider availability.", "Try the request again in a moment."])
    if isinstance(exc, ProviderError):
        return user_error("Research provider failed", ["An external research provider could not complete the request.", "Check your API keys and provider account status.", "Try again after correcting the provider settings."])
    return user_error("Research failed", ["The briefing could not be completed.", "Please try again in a moment.", "If this keeps happening, restart the backend and check the provider configuration."])
