from pathlib import Path
import tomllib


def test_streamlit_theme_defaults_to_light():
    config_path = Path(".streamlit/config.toml")

    config = tomllib.loads(config_path.read_text(encoding="utf-8"))

    assert config["theme"]["base"] == "light"
    assert config["theme"]["backgroundColor"] == "#FFFFFF"
    assert config["theme"]["secondaryBackgroundColor"] == "#F7F8FA"
