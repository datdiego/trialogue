import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import ChatStreamChunk
from app.routers import chat
from app.config import _demo_call_tracker, _request_rate_tracker


class DemoSystemTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        _demo_call_tracker.clear()
        _request_rate_tracker.clear()
        chat.DEMO_KEYS.clear()

    def _parse_sse(self, raw_text: str):
        events = []
        for block in raw_text.strip().split("\n\n"):
            if not block.startswith("data: "):
                continue
            payload = block[6:]
            events.append(payload if payload == "[DONE]" else json.loads(payload))
        return events

    def test_demo_models_endpoint_returns_only_groq_and_no_keys(self):
        chat.DEMO_KEYS.update({"groq": "groq-super-secret"})

        response = self.client.get("/api/demo-models")
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertIn("models", body)
        self.assertIn("remaining_calls", body)

        providers = {m["provider"] for m in body["models"]}
        self.assertEqual(providers, {"groq"})
        self.assertNotIn("groq-super-secret", response.text)

        for model in body["models"]:
            self.assertIn("id", model)
            self.assertNotIn("key", model)

    def test_demo_mode_rate_limit_is_3_requests_per_minute_per_ip(self):
        chat.DEMO_KEYS.update({"groq": "groq-demo"})

        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            yield ChatStreamChunk(model=model, content="chunk", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        payload = {
            "messages": [{"role": "user", "content": "demo"}],
            "models": ["groq/llama-3.3-70b-versatile"],
            "stream": True,
        }

        with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream):
            for _ in range(3):
                ok_response = self.client.post("/api/chat", json=payload)
                self.assertEqual(ok_response.status_code, 200)

            blocked_response = self.client.post("/api/chat", json=payload)
            self.assertEqual(blocked_response.status_code, 429)
            self.assertIn("Rate limit exceeded", blocked_response.text)

    def test_byok_requests_do_not_consume_demo_call_budget(self):
        chat.DEMO_KEYS.update({"groq": "groq-demo"})

        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            yield ChatStreamChunk(model=model, content="byok", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        payload = {
            "messages": [{"role": "user", "content": "hello"}],
            "models": ["groq/llama-3.3-70b-versatile"],
            "stream": True,
        }

        with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream):
            for _ in range(6):
                response = self.client.post(
                    "/api/chat",
                    json=payload,
                    headers={"X-Groq-Key": "user-key"},
                )
                self.assertEqual(response.status_code, 200)

        self.assertEqual(len(_demo_call_tracker.get("testclient", [])), 0)

    def test_no_user_key_and_no_demo_key_returns_safe_error(self):
        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            if not api_keys.get("groq"):
                yield ChatStreamChunk(
                    model=model,
                    content="",
                    done=True,
                    error="No API key provided for this model.",
                )
                return
            yield ChatStreamChunk(model=model, content="unexpected", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        payload = {
            "messages": [{"role": "user", "content": "fallback"}],
            "models": ["groq/llama-3.3-70b-versatile"],
            "stream": True,
        }

        with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream):
            response = self.client.post("/api/chat", json=payload)

        self.assertEqual(response.status_code, 200)
        events = self._parse_sse(response.text)
        chunks = [e for e in events if e != "[DONE]"]
        self.assertTrue(any(c.get("error") == "No API key provided for this model." for c in chunks))


if __name__ == "__main__":
    unittest.main()
