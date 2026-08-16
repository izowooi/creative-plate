from __future__ import annotations

import uvicorn

from .app import create_app
from .config import load_config


def main() -> None:
    config = load_config()
    uvicorn.run(
        create_app(config),
        host=config.host,
        port=config.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
