import warnings


def pytest_configure(config):
    # Suppress RuntimeWarning for unawaited asyncio.Queue.get coroutines that
    # arise when asyncio.wait_for is mock-patched to raise TimeoutError in the
    # debate-timeout test.  The pending coroutines are never actually awaited
    # because the mock short-circuits the wait, but this is intentional test
    # behaviour, not a production bug.
    warnings.filterwarnings(
        "ignore",
        message="coroutine 'Queue.get' was never awaited",
        category=RuntimeWarning,
    )
