from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI()

    @app.get("/hello-world")
    def hello_world() -> dict[str, str]:
        return {"message": "Hello, World!"}

    return app
