from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ThreatLens AI API"
    app_version: str = "0.2.0"
    database_url: str = "postgresql+psycopg://threatlens:threatlens@localhost:5432/threatlens"
    secret_key: str = "local-development-only-change-this-secret-key"
    access_token_expire_minutes: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
