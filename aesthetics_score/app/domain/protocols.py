from typing import Protocol, runtime_checkable
from PIL import Image


@runtime_checkable
class ImageScorerProtocol(Protocol):
    """Protocol for any service that can score an image aesthetically.

    Adheres to Dependency Inversion: high-level services depend on this
    abstraction instead of concrete model implementations.
    """

    def score_pil_image(self, image: Image.Image) -> float:
        """Return an aesthetic score (0.0 ~ 10.0) for a PIL image."""
        ...


