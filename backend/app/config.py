from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openrouter_api_key: str | None = None
    serper_api_key: str | None = None
    use_mocks: bool = Field(default=True)
    database_url: str = "sqlite:///./company_research.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    openrouter_model: str = "openrouter/free"
    openrouter_http_referer: str | None = "http://localhost:5173"
    openrouter_app_title: str | None = "Company Research Tool"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
