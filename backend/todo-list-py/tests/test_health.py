from src.health import health_body


def test_health_body() -> None:
    assert health_body() == '{"ok": true}'
