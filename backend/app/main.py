from __future__ import annotations

import os

import uvicorn

from app.api import create_app

app = create_app()


def run() -> None:
    uvicorn.run(
        "app.main:app",
        host=os.getenv("SMARTCROWD_HOST", "0.0.0.0"),
        port=int(os.getenv("SMARTCROWD_PORT", "8000")),
        reload=os.getenv("SMARTCROWD_RELOAD", "0") == "1",
    )


if __name__ == "__main__":
    run()

