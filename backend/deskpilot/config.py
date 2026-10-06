from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore', env_file_encoding='utf-8')
    app_mode: Literal['demo', 'cloud'] = 'demo'
    data_dir: Path = Path('data')
    repo_root: Path = Path(__file__).resolve().parents[2]
    llm_base_url: str = ''
    llm_api_key: str = ''
    llm_model: str = ''
    embedding_base_url: str = ''
    embedding_api_key: str = ''
    embedding_model: str = 'text-embedding-v4'
    embedding_dimensions: int = 1024
    rerank_endpoint: str = ''
    rerank_api_key: str = ''
    rerank_model: str = 'qwen3-rerank'
    max_run_cost_cny: float = 0.50
    max_daily_cost_cny: float = 10.00
    max_agent_steps: int = 8
    request_timeout_seconds: float = 30
    max_retries: int = 2
    llm_input_cny_per_million: float | None = None
    llm_output_cny_per_million: float | None = None
    embedding_cny_per_million: float | None = None
    rerank_cny_per_million: float | None = None
    price_as_of: str = ''
    mcp_remote_enabled: bool = False
    mcp_remote_url: str = ''
    mcp_remote_allowed_host: str = ''
    mcp_remote_token: SecretStr = SecretStr('')
    mcp_timeout_seconds: float = Field(default=15, ge=1, le=60)
    mcp_max_result_bytes: int = Field(default=16384, ge=1024, le=65536)
    mcp_daily_call_limit: int = Field(default=200, ge=1, le=10000)
    mcp_failure_threshold: int = Field(default=3, ge=1, le=10)
    mcp_cooldown_seconds: int = Field(default=60, ge=1, le=3600)

    @field_validator('llm_input_cny_per_million', 'llm_output_cny_per_million',
                     'embedding_cny_per_million', 'rerank_cny_per_million', mode='before')
    @classmethod
    def empty_price(cls, value):
        return None if value == '' else value

    @field_validator('data_dir')
    @classmethod
    def absolute_data(cls, value):
        return value.resolve()

    def cloud_missing(self) -> list[str]:
        names = ['llm_base_url', 'llm_api_key', 'llm_model', 'embedding_base_url',
                 'embedding_api_key', 'rerank_endpoint', 'rerank_api_key',
                 'llm_input_cny_per_million', 'llm_output_cny_per_million',
                 'embedding_cny_per_million', 'rerank_cny_per_million', 'price_as_of']
        return [name.upper() for name in names if getattr(self, name) in (None, '')]
