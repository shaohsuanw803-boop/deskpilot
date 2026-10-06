"""Synchronous Qwen gateway: one audited, budgeted boundary for every cloud call."""
from __future__ import annotations

import math
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from .policy import check_outbound


class ProviderError(ValueError):
    pass


class BudgetExceeded(ProviderError):
    pass


class ProviderGateway:
    def __init__(self, store, settings, client: httpx.Client | None = None):
        self.store, self.settings = store, settings
        self.client = client or httpx.Client(timeout=settings.request_timeout_seconds, follow_redirects=False)

    def _price(self, name: str) -> float:
        value = getattr(self.settings, name, None)
        if value is None or value == "" or not math.isfinite(float(value)) or float(value) < 0:
            raise ProviderError(f"云端价格配置缺失或无效：{name}")
        if not getattr(self.settings, "price_as_of", ""):
            raise ProviderError("云端价格需填写 PRICE_AS_OF")
        return float(value)

    def _reserve(self, kind, run_id, input_bound, output_bound, model):
        input_rate = self._price({"chat": "llm_input_cny_per_million", "embedding": "embedding_cny_per_million", "rerank": "rerank_cny_per_million"}[kind])
        output_rate = self._price("llm_output_cny_per_million") if kind == "chat" else 0
        cost = (input_bound * input_rate + output_bound * output_rate) / 1_000_000
        day = datetime.now(timezone.utc).date().isoformat()
        with self.store.transaction():
            records = self.store.list("usage")
            run_cost = sum(r.get("charged_cny", r.get("reserved_cny", 0)) for r in records if r.get("run_id") == run_id)
            day_cost = sum(r.get("charged_cny", r.get("reserved_cny", 0)) for r in records if r.get("day") == day)
            if run_cost + cost > self.settings.max_run_cost_cny or day_cost + cost > self.settings.max_daily_cost_cny:
                raise BudgetExceeded("云端预算不足；已停止调用，保留本地检索结果。")
            return self.store.put("usage", {"id": str(uuid.uuid4()), "run_id": run_id, "day": day,
                "kind": kind, "model": model, "reserved_cny": cost, "charged_cny": cost,
                "actual_cny": None, "usage_status": "reserved", "input_tokens": None,
                "output_tokens": None, "input_rate": input_rate, "output_rate": output_rate,
                "price_as_of": self.settings.price_as_of})

    def _settle(self, record, response, status):
        usage = response.get("usage") if isinstance(response, dict) else None
        input_tokens = output_tokens = None
        if isinstance(usage, dict):
            input_tokens = usage.get("prompt_tokens", usage.get("input_tokens"))
            if record["kind"] != "chat" and input_tokens is None:
                input_tokens = usage.get("total_tokens")
            output_tokens = usage.get("completion_tokens", usage.get("output_tokens")) if record["kind"] == "chat" else 0
        valid = all(isinstance(n, int) and not isinstance(n, bool) and n >= 0 for n in (input_tokens, output_tokens))
        record.update(status=status, usage_status="reported" if valid else "unknown",
                      input_tokens=input_tokens, output_tokens=output_tokens)
        if valid:
            actual = (input_tokens * record["input_rate"] + output_tokens * record["output_rate"]) / 1_000_000
            record.update(actual_cny=actual, charged_cny=actual)
        self.store.put("usage", record)

    def _request_timeout(self, run_id):
        timeout = float(self.settings.request_timeout_seconds)
        run = self.store.get("run", run_id)
        deadline = run.get("deadline_at") if run else None
        if deadline:
            try:
                remaining = (datetime.fromisoformat(deadline.replace("Z", "+00:00")) - datetime.now(timezone.utc)).total_seconds()
            except (TypeError, ValueError):
                raise ProviderError("任务 deadline_at 配置无效") from None
            if remaining <= 0:
                raise ProviderError("本次任务已超时，已停止后续云端请求。")
            timeout = min(timeout, remaining)
        return timeout

    def _call(self, kind, url, key, payload, texts, run_id, output_tokens=0, authorize=None):
        if self.settings.app_mode != "cloud":
            raise ProviderError("demo 模式禁止外部 API 调用")
        check_outbound(texts)
        if not url or not key or not payload.get("model"):
            raise ProviderError(f"{kind} 云端配置缺失，请填写地址、API Key 和模型名")
        if not str(url).startswith("https://"):
            raise ProviderError("云端接口必须使用 HTTPS")
        # UTF-8 byte count bounds BPE token usage conservatively; add message framing.
        input_bound = sum(len(t.encode("utf-8")) + 32 for t in texts) + 256
        for attempt in range(min(int(self.settings.max_retries), 2) + 1):
            self._request_timeout(run_id)
            check_outbound(texts)
            if authorize:
                authorize()
            record = self._reserve(kind, run_id, input_bound, output_tokens, payload["model"])
            try:
                timeout = self._request_timeout(run_id)
                # Budget reservation can wait for SQLite. Recheck immediately before
                # admitting every HTTP attempt, including retries of the same payload.
                if authorize:
                    authorize()
            except Exception:
                record.update(status="authorization_or_deadline_not_sent", actual_cny=0, charged_cny=0, usage_status="not_sent")
                self.store.put("usage", record)
                raise
            try:
                response = self.client.post(url, json=payload, headers={"Authorization": f"Bearer {key}"}, timeout=timeout)
            except httpx.TransportError as exc:
                self._settle(record, None, "transport_error")
                if attempt < min(int(self.settings.max_retries), 2):
                    time.sleep(.05 * (2 ** attempt))
                    continue
                raise ProviderError(f"{kind} 网络不可用（{type(exc).__name__}）") from None
            if not response.is_success:
                self._settle(record, None, f"http_{response.status_code}")
                if (response.status_code == 429 or response.status_code >= 500) and attempt < min(int(self.settings.max_retries), 2):
                    time.sleep(.05 * (2 ** attempt))
                    continue
                raise ProviderError(f"{kind} 请求失败：HTTP {response.status_code}")
            try:
                result = response.json()
                if not isinstance(result, dict):
                    raise ValueError()
            except ValueError:
                self._settle(record, None, "invalid_json")
                raise ProviderError(f"{kind} 返回了无效 JSON") from None
            self._settle(record, result, "success")
            # HTTPX bounds each I/O phase; discard even valid responses that arrive after
            # the workflow deadline, while retaining their actual provider charge.
            self._request_timeout(run_id)
            return result
        raise ProviderError("调用重试次数已耗尽")

    def embeddings(self, texts: list[str], run_id: str, authorize=None) -> list[list[float]]:
        vectors = []
        for start in range(0, len(texts), 10):
            batch = texts[start:start + 10]
            payload = {"model": self.settings.embedding_model, "input": batch,
                "dimensions": self.settings.embedding_dimensions, "encoding_format": "float"}
            result = self._call("embedding", self.settings.embedding_base_url.rstrip("/") + "/embeddings",
                self.settings.embedding_api_key, payload, batch, run_id, authorize=authorize)
            try:
                rows = sorted(result["data"], key=lambda r: r["index"])
                if [r["index"] for r in rows] != list(range(len(batch))):
                    raise ValueError()
                for row in rows:
                    vector = row["embedding"]
                    if len(vector) != self.settings.embedding_dimensions or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in vector):
                        raise ProviderError("embedding dimension 或数值无效")
                    vectors.append(vector)
            except (KeyError, TypeError, ValueError) as exc:
                if isinstance(exc, ProviderError):
                    raise
                raise ProviderError("embedding 返回结构无效") from None
        return vectors

    def rerank(self, query: str, documents: list[str], run_id: str, top_n: int = 20, authorize=None) -> list[dict]:
        if not documents:
            return []
        payload = {"model": self.settings.rerank_model, "query": query, "documents": documents, "top_n": min(top_n, len(documents))}
        result = self._call("rerank", self.settings.rerank_endpoint, self.settings.rerank_api_key,
                            payload, [query] * len(documents) + documents, run_id, authorize=authorize)
        try:
            rows = result["results"]
            seen = set()
            for row in rows:
                index = row["index"]
                score = row["relevance_score"]
                if not isinstance(index, int) or index < 0 or index >= len(documents) or index in seen or not math.isfinite(float(score)):
                    raise ValueError()
                seen.add(index)
            return sorted(rows, key=lambda row: row["relevance_score"], reverse=True)
        except (KeyError, TypeError, ValueError):
            raise ProviderError("rerank 返回结构或文档索引无效") from None

    def chat(self, messages: list[dict[str, Any]], run_id: str, max_tokens: int = 1000, authorize=None) -> str:
        texts = [m["content"] for m in messages]
        payload = {"model": self.settings.llm_model, "messages": messages, "max_tokens": max_tokens,
                   "temperature": 0, "enable_thinking": False}
        result = self._call("chat", self.settings.llm_base_url.rstrip("/") + "/chat/completions",
            self.settings.llm_api_key, payload, texts, run_id, output_tokens=max_tokens, authorize=authorize)
        try:
            content = result["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError()
            return content
        except (KeyError, IndexError, TypeError, ValueError):
            raise ProviderError("chat 返回了空内容或无效结构") from None

    def connectivity_check(self):
        run_id = "config-check-" + str(uuid.uuid4())
        self.embeddings(["连接检查"], run_id)
        self.rerank("连接", ["连接检查"], run_id, top_n=1)
        self.chat([{"role": "user", "content": "请回复 OK"}], run_id, max_tokens=8)
        return {"ok": True, "run_id": run_id, "providers": ["chat", "embedding", "rerank"]}

    def close(self):
        self.client.close()
