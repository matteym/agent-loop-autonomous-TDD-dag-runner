from fastapi.testclient import TestClient

from hello_world.app import create_app


def test_get_hello_world_returns_greeting() -> None:
    client = TestClient(create_app())
    response = client.get("/hello-world")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello, World!"}
