import importlib.util
from pathlib import Path


def _load_streamlit_app():
    app_path = Path("dashboard/streamlit_app.py")
    spec = importlib.util.spec_from_file_location("streamlit_app_under_test", app_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_auto_refresh_default_is_ten_minutes():
    app = _load_streamlit_app()

    assert app.DEFAULT_REFRESH_SECONDS == 600
    assert app.MAX_REFRESH_SECONDS >= app.DEFAULT_REFRESH_SECONDS


def test_manual_refresh_button_triggers_rerun_when_clicked():
    app = _load_streamlit_app()
    reruns = []

    def button_fn(label, use_container_width):
        assert label == app.MANUAL_REFRESH_LABEL
        assert use_container_width is True
        return True

    app._request_manual_refresh(button_fn=button_fn, rerun_fn=lambda: reruns.append("rerun"))

    assert reruns == ["rerun"]


def test_manual_refresh_button_does_not_rerun_when_not_clicked():
    app = _load_streamlit_app()
    reruns = []

    app._request_manual_refresh(button_fn=lambda label, use_container_width: False, rerun_fn=lambda: reruns.append("rerun"))

    assert reruns == []
