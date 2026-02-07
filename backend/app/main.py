from __future__ import annotations

import logging
import os

import uvicorn

from app.api import create_app


def configure_logging() -> None:
    logging.basicConfig(
        level=os.getenv("SMARTCROWD_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


configure_logging()
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
