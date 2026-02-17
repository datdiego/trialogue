import asyncio
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import ChatStreamChunk
from app.routers import chat
from app.config import _demo_call_tracker, _request_rate_tracker, check_demo_limit, record_demo_calls


class IntegrationAndEdgeCaseTests(unittest.TestCase):
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

    def test_parallel_chat_streams_multiple_models(self):
        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            yield ChatStreamChunk(model=model, content=f"{model}-chunk", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        payload = {
            "messages": [{"role": "user", "content": "parallel"}],
            "models": ["gpt-4o-mini", "claude-3-5-haiku-20241022"],
            "stream": True,
        }

        with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream):
            response = self.client.post("/api/chat", json=payload)

        self.assertEqual(response.status_code, 200)
        events = self._parse_sse(response.text)
        chunks = [e for e in events if e != "[DONE]"]
        done_models = {c["model"] for c in chunks if c["done"]}
        self.assertEqual(done_models, {"gpt-4o-mini", "claude-3-5-haiku-20241022"})

    def test_debate_supports_exactly_2_and_3_models(self):
        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            yield ChatStreamChunk(model=model, content="ok", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        for models in (
            ["gpt-4o-mini", "claude-3-5-haiku-20241022"],
            ["gpt-4o-mini", "claude-3-5-haiku-20241022", "groq/llama-3.3-70b-versatile"],
        ):
            payload = {"question": "edge case", "models": models}
            with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream):
                response = self.client.post("/api/debate", json=payload)

            self.assertEqual(response.status_code, 200)
            events = self._parse_sse(response.text)
            chunks = [e for e in events if e != "[DONE]"]
            for round_num in (1, 2, 3):
                round_done = [c for c in chunks if c["round"] == round_num and c["done"]]
                self.assertEqual(len(round_done), len(models))

    def test_debate_timeout_emits_stream_timeout_errors(self):
        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            # This stream does not yield quickly enough from queue perspective when wait_for is forced to timeout.
            await asyncio.sleep(0)
            yield ChatStreamChunk(model=model, content="late", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        async def always_timeout(awaitable, timeout):
            raise asyncio.TimeoutError()

        payload = {
            "question": "timeout test",
            "models": ["gpt-4o-mini", "claude-3-5-haiku-20241022"],
        }

        with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream), patch(
            "app.routers.chat.asyncio.wait_for", side_effect=always_timeout
        ):
            response = self.client.post("/api/debate", json=payload)

        self.assertEqual(response.status_code, 200)
        events = self._parse_sse(response.text)
        chunks = [e for e in events if e != "[DONE]"]
        self.assertTrue(any(c.get("error") == "Stream timeout" for c in chunks))

    def test_concurrent_session_limits_are_isolated_by_ip(self):
        ip1 = "10.0.0.1"
        ip2 = "10.0.0.2"

        # Exhaust IP1
        for _ in range(5):
            allowed, _ = check_demo_limit(ip1, 1)
            self.assertTrue(allowed)
            record_demo_calls(ip1, 1)

        allowed_ip1, remaining_ip1 = check_demo_limit(ip1, 1)
        self.assertFalse(allowed_ip1)
        self.assertEqual(remaining_ip1, 0)

        # IP2 should still be unaffected
        allowed_ip2, remaining_ip2 = check_demo_limit(ip2, 1)
        self.assertTrue(allowed_ip2)
        self.assertEqual(remaining_ip2, 5)

    def test_validate_key_rejects_control_characters(self):
        payload = {
            "provider": "groq",
            "key": "bad\nkey",
        }
        response = self.client.post("/api/validate-key", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_chat_rejects_invalid_model_identifier_format(self):
        payload = {
            "messages": [{"role": "user", "content": "hello"}],
            "models": ["gpt-4o-mini<script>"],
            "stream": True,
        }
        response = self.client.post("/api/chat", json=payload)
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
