from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: Literal["development", "test", "production"] = "development"
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    web_origins: list[str] = ["http://127.0.0.1:3000"]
    enable_mock_ai: bool = False
    local_ai_base_url: str = ""
    compatible_ai_base_url: str = ""
    stun_urls: list[str] = []
    turn_urls: list[str] = []
    turn_shared_secret: SecretStr = SecretStr("")
    rtc_relay_only: bool = False

    @model_validator(mode="after")
    def secure_config(self):
        import re

        if (
            len(self.stun_urls) > 4
            or len(self.turn_urls) > 4
            or any(not re.fullmatch(r"stun:[^\s@/?]+", url) for url in self.stun_urls)
            or any(
                not re.fullmatch(r"turns?:[^\s@/?]+(?:\?transport=(?:udp|tcp))?", url)
                for url in self.turn_urls
            )
        ):
            raise ValueError("Invalid operator ICE configuration")
        if bool(self.turn_urls) != bool(self.turn_shared_secret.get_secret_value()) or (
            self.rtc_relay_only and not self.turn_urls
        ):
            raise ValueError("TURN URLs and a shared secret are required together")
        if self.environment == "production":
            if self.enable_mock_ai:
                raise ValueError("Mock AI cannot be enabled in production")
            if not self.supabase_url.startswith("https://"):
                raise ValueError("Production Supabase requires HTTPS")
            if any(
                not origin.startswith("https://") or "*" in origin for origin in self.web_origins
            ):
                raise ValueError("Production CORS requires explicit HTTPS origins")
        if self.compatible_ai_base_url and not self.compatible_ai_base_url.startswith("https://"):
            raise ValueError("Compatible cloud endpoints require HTTPS")
        for url in [self.local_ai_base_url, self.compatible_ai_base_url]:
            if url:
                from urllib.parse import urlsplit

                parsed = urlsplit(url)
                if (
                    parsed.scheme not in {"http", "https"}
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                    or parsed.query
                    or parsed.fragment
                ):
                    raise ValueError("Invalid operator-controlled AI endpoint")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
