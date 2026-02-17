import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import ChatStreamChunk
from app.routers import chat
from app.config import _demo_call_tracker


class DebateEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        _demo_call_tracker.clear()
        chat.DEMO_KEYS.clear()

    def _parse_sse_events(self, raw_text: str):
        events = []
        for block in raw_text.strip().split("\n\n"):
            if not block.startswith("data: "):
                continue
            payload = block[6:]
            if payload == "[DONE]":
                events.append("[DONE]")
            else:
                events.append(json.loads(payload))
        return events

    def test_debate_completes_three_rounds_with_sse_metadata(self):
        question = "How should cities reduce traffic?"

        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            prompt = messages[0]["content"]
            if prompt == question:
                round_tag = "r1"
            elif "Please review the other responses" in prompt:
                round_tag = "r2"
            else:
                round_tag = "r3"

            yield ChatStreamChunk(model=model, content=f"{model}-{round_tag}", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        payload = {
            "question": question,
            "models": ["gpt-4o-mini", "claude-3-5-haiku-20241022"],
            "temperature": 0.6,
            "max_tokens": 500,
        }

        with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream):
            response = self.client.post("/api/debate", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "text/event-stream; charset=utf-8")

        events = self._parse_sse_events(response.text)
        self.assertEqual(events[-1], "[DONE]")
        chunks = [e for e in events if e != "[DONE]"]

        rounds_seen = {(c["round"], c["round_type"]) for c in chunks}
        self.assertIn((1, "answer"), rounds_seen)
        self.assertIn((2, "review"), rounds_seen)
        self.assertIn((3, "consensus"), rounds_seen)

        done_per_round = {(c["round"], c["model"]) for c in chunks if c["done"]}
        for round_num in (1, 2, 3):
            self.assertIn((round_num, "gpt-4o-mini"), done_per_round)
            self.assertIn((round_num, "claude-3-5-haiku-20241022"), done_per_round)

    def test_debate_handles_mid_debate_model_failure_and_continues(self):
        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            prompt = messages[0]["content"]
            if "Please review the other responses" in prompt and model == "gpt-4o-mini":
                raise RuntimeError("simulated round2 failure")
            yield ChatStreamChunk(model=model, content="ok", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        payload = {
            "question": "Should schools start later?",
            "models": ["gpt-4o-mini", "claude-3-5-haiku-20241022"],
        }

        with patch("app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream):
            response = self.client.post("/api/debate", json=payload)

        self.assertEqual(response.status_code, 200)
        events = self._parse_sse_events(response.text)
        chunks = [e for e in events if e != "[DONE]"]

        round2_errors = [
            c for c in chunks
            if c["round"] == 2 and c["model"] == "gpt-4o-mini" and c.get("error")
        ]
        self.assertTrue(round2_errors)

        round3_done_other = [
            c for c in chunks
            if c["round"] == 3 and c["model"] == "claude-3-5-haiku-20241022" and c["done"]
        ]
        self.assertTrue(round3_done_other)

    def test_debate_requires_at_least_two_models(self):
        payload = {
            "question": "Single model should fail validation",
            "models": ["gpt-4o-mini"],
        }

        response = self.client.post("/api/debate", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_debate_demo_rate_limit_is_enforced(self):
        # Debate with 2 models requires 6 calls (3 rounds x 2 models), exceeds demo 5-call budget.
        chat.DEMO_KEYS.update({"groq": "demo-secret-key"})

        payload = {
            "question": "demo rate limit",
            "models": [
                "groq/llama-3.3-70b-versatile",
                "groq/llama-3.1-8b-instant",
            ],
        }

        response = self.client.post("/api/debate", json=payload)
        self.assertEqual(response.status_code, 429)
        self.assertIn("Demo session limit reached", response.text)

    def test_debate_byok_skips_demo_limit_check(self):
        async def fake_chat_stream(model, messages, api_keys, temperature=0.7, max_tokens=1000):
            yield ChatStreamChunk(model=model, content="ok", done=False)
            yield ChatStreamChunk(model=model, content="", done=True)

        payload = {
            "question": "byok",
            "models": ["groq/llama-3.3-70b-versatile", "groq/llama-3.1-8b-instant"],
        }

        with patch("app.routers.chat.check_demo_limit") as check_demo_limit_mock, patch(
            "app.routers.chat.LLMService.chat_stream", side_effect=fake_chat_stream
        ):
            response = self.client.post(
                "/api/debate",
                json=payload,
                headers={"X-Groq-Key": "user-provided-groq-key"},
            )

        self.assertEqual(response.status_code, 200)
        check_demo_limit_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
