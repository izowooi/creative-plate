# 🎙️ YouTube to SRT - Local AI Subtitle Generator

> 🇰🇷 [한국어 README](./README.md)

<div align="center">

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776ab?style=for-the-badge&logo=python)](https://www.python.org)
[![Gradio](https://img.shields.io/badge/Gradio-4.0%2B-ff7c00?style=for-the-badge&logo=gradio)](https://gradio.app)
[![faster-whisper](https://img.shields.io/badge/faster--whisper-1.0%2B-00b4d8?style=for-the-badge)](https://github.com/SYSTRAN/faster-whisper)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-2024-red?style=for-the-badge)](https://github.com/yt-dlp/yt-dlp)
[![uv](https://img.shields.io/badge/uv-package_manager-7c3aed?style=for-the-badge)](https://github.com/astral-sh/uv)

**Paste a YouTube URL and let local Whisper AI generate English SRT subtitles instantly** ✨

[🎯 Features](#-features) | [💻 Getting Started](#-getting-started) | [🎮 How to Use](#-how-to-use)

</div>

---

## 🎯 Features

**YouTube to SRT** accepts up to 10 YouTube URLs, downloads audio via `yt-dlp`, and automatically generates English SRT subtitles using `faster-whisper` running entirely on your local machine.

No cloud API costs. Runs fully offline on a Mac mini or any local machine. Available as both a Gradio web UI and a CLI tool.

### ✨ Key Features

- 🌐 **Batch URL processing** — Handle up to 10 URLs in a single run
- 🎙️ **Local Whisper transcription** — Offline processing via `faster-whisper` (no internet required for transcription)
- 🖥️ **Gradio Web UI** — One-click operation in the browser with real-time progress tracking
- ⌨️ **CLI support** — Command-line interface suitable for scripting and automation
- ⚡ **3 operation modes** — Extract audio only / Transcribe existing audio / Both at once
- 📦 **Multiple Whisper models** — From `tiny` to `large-v3`, choose your speed vs. accuracy trade-off
- 🔄 **Skip duplicate downloads** — Already-extracted audio files are reused automatically
- 📥 **Direct UI download** — Download generated SRT files directly from the browser

---

## 🎮 How to Use

```mermaid
graph TD
    A[🌐 Enter YouTube URLs\nup to 10] --> B{Select Mode}
    B -->|extract| C[🎵 Extract audio\naudio/*.m4a]
    B -->|transcribe| D[📝 Existing audio → SRT\nsrt/*.srt]
    B -->|all| E[🎵 Extract + 📝 Transcribe\nin one shot]
    C --> F[💾 Save file]
    D --> G[Select Whisper model\ntiny / base / small\nmedium / large-v3]
    E --> G
    G --> H[⚙️ Run local faster-whisper]
    H --> I[✅ SRT subtitle ready]
    I --> J[📥 Download file]

    style A fill:#ff7c00,color:#fff
    style H fill:#00b4d8,color:#fff
    style I fill:#4ade80,color:#000
```

### 📝 Step-by-Step Guide

**GUI (Recommended)**

| Step | Description |
|------|-------------|
| 1️⃣ Start server | Run `uv run youtube-to-srt-ui`, then open `http://127.0.0.1:7860` |
| 2️⃣ Enter URLs | Paste YouTube URLs one per line (up to 10) |
| 3️⃣ Set options | Choose mode, Whisper model, and output folders |
| 4️⃣ Run | Click the Run button and watch real-time progress on the right |
| 5️⃣ Download | Click the download link once processing is complete |

**CLI Usage**

```bash
# 1) Extract audio only (default) — creates audio/<video_id>.m4a
uv run youtube-to-srt "https://www.youtube.com/watch?v=jNQXAC9IVRw"

# 2) Transcribe an existing audio file to SRT
uv run youtube-to-srt --mode transcribe audio/jNQXAC9IVRw.m4a

# 3) Extract + transcribe in one step
uv run youtube-to-srt --mode all "https://www.youtube.com/watch?v=jNQXAC9IVRw"

# 4) Read URLs from a file (# comments and blank lines are ignored)
uv run youtube-to-srt --urls-file urls.example.txt
```

> ⚠️ In `zsh`, always wrap URLs in quotes due to special characters `?` and `=`.

---

## 🏗️ Tech Stack

<div align="center">

| Category | Technology | Purpose |
|----------|-----------|---------|
| UI | Gradio 4.0+ | Web interface |
| Audio extraction | yt-dlp | YouTube audio download |
| Speech recognition | faster-whisper | Local Whisper AI transcription |
| Package manager | uv | Fast Python dependency management |
| Testing | pytest | Unit & integration tests |
| Python | 3.11 ~ 3.12 | Runtime |

</div>

### 🎨 Architecture

```mermaid
graph LR
    subgraph Input["Input Layer"]
        UI[🖥️ Gradio UI\nui.py]
        CLI[⌨️ CLI\ncli.py]
    end

    subgraph Core["Core Logic"]
        CORE[core.py\nMode Enum\nURL Parser]
        PIPE[pipeline.py\nBatch Orchestrator]
        UIH[ui_handlers.py\nGradio Handlers]
    end

    subgraph IO["I/O Layer"]
        EXT[extractor.py\nyt-dlp audio extraction]
        TRANS[transcriber.py\nfaster-whisper transcription]
        FMT[srt_formatter.py\nSRT formatter]
    end

    subgraph Storage["File Storage"]
        AUDIO[📁 audio/\n*.m4a]
        SRT[📁 srt/\n*.srt]
    end

    UI --> UIH
    CLI --> PIPE
    UIH --> PIPE
    PIPE --> CORE
    PIPE --> EXT
    PIPE --> TRANS
    TRANS --> FMT
    EXT --> AUDIO
    FMT --> SRT

    style UI fill:#ff7c00,color:#fff
    style CLI fill:#7c3aed,color:#fff
    style PIPE fill:#00b4d8,color:#fff
    style TRANS fill:#4ade80,color:#000
```

---

## 📁 Project Structure

```
youtube-to-srt/
├── 📄 pyproject.toml          # Project config and dependencies
├── 📄 .python-version         # Pinned Python version
├── 📄 urls.example.txt        # Example URL list file
├── 📂 src/youtube_to_srt/
│   ├── 🔧 core.py             # Mode enum, URL text parser (shared logic)
│   ├── 🖥️ ui.py               # Gradio Blocks assembly and entry point
│   ├── 🎛️ ui_handlers.py      # Pure Gradio-free handlers (TDD target)
│   ├── ⌨️ cli.py              # CLI argument parsing and entry point
│   ├── 🎵 extractor.py        # yt-dlp-based audio extraction
│   ├── 🎙️ transcriber.py      # faster-whisper backend + SRT writer
│   ├── 📝 srt_formatter.py    # Segment → SRT string converter
│   └── 🔄 pipeline.py         # Batch orchestrator
└── 📂 tests/
    ├── test_cli.py
    ├── test_core.py
    ├── test_extractor.py
    ├── test_transcriber.py
    ├── test_srt_formatter.py
    ├── test_pipeline.py
    ├── test_ui_handlers.py
    └── test_integration.py    # Real network + Whisper (disabled by default)
```

---

## 💻 Getting Started

### 📋 Prerequisites

- Python 3.11 or 3.12
- [uv](https://github.com/astral-sh/uv) package manager

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 🚀 Running Locally

```bash
# 1. Clone the repository
git clone https://github.com/izowooi/creative-plate.git
cd creative-plate/youtube-to-srt

# 2. Install dependencies
uv sync

# 3-a. Launch Gradio UI (recommended)
uv run youtube-to-srt-ui
# → Open http://127.0.0.1:7860 in your browser

# 3-b. Use the CLI
uv run youtube-to-srt --help
```

### ⚙️ Available Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode` | `extract` | `extract` / `transcribe` / `all` |
| `--audio-dir` | `audio/` | Directory to save extracted audio |
| `--srt-dir` | `srt/` | Directory to save generated SRT files |
| `--model` | `small` | Whisper model (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `--language` | `en` | Transcription language code |
| `--urls-file` | — | Path to a file containing URLs |

### 🧪 Running Tests

```bash
# Unit tests only (fast, no network required)
uv run pytest

# Including integration tests (real YouTube download + Whisper)
uv run pytest -m "integration or not integration"
```

---

## 🤖 Whisper Model Selection Guide

```mermaid
graph TD
    Q1{Speed\npriority?} -->|Fast| Q2{Minimum\naccuracy needed?}
    Q1 -->|Accuracy first| Q3{VRAM available?}
    Q2 -->|Low OK| T[tiny\n~1 GB RAM]
    Q2 -->|Some needed| B[base\n~1 GB RAM]
    Q3 -->|4 GB or less| S[small ✅ default\n~2 GB RAM]
    Q3 -->|8 GB or more| M[medium\n~5 GB RAM]
    Q3 -->|16 GB or more| L[large-v3\n~10 GB RAM]

    style S fill:#4ade80,color:#000
    style L fill:#00b4d8,color:#fff
```

| Model | Speed | Accuracy | VRAM |
|-------|-------|----------|------|
| `tiny` | ⚡⚡⚡⚡⚡ | ⭐⭐ | ~1 GB |
| `base` | ⚡⚡⚡⚡ | ⭐⭐⭐ | ~1 GB |
| `small` | ⚡⚡⚡ | ⭐⭐⭐⭐ | ~2 GB |
| `medium` | ⚡⚡ | ⭐⭐⭐⭐⭐ | ~5 GB |
| `large-v3` | ⚡ | ⭐⭐⭐⭐⭐ | ~10 GB |

---

## 🎯 Roadmap

- [ ] **OpenAI Whisper API backend** — Cloud transcription option without local resources (`--backend openai`)
- [ ] **Multi-language support** — Auto-detect Korean, Japanese, and more
- [ ] **Parallel processing** — Faster batch runs via concurrent URL handling
- [ ] **SRT editor UI** — Inline editing of generated subtitles
- [ ] **VTT / ASS format** — Additional subtitle format export

---

## 🤝 Contributing

1. Fork the repository and create a branch
2. Commit your changes (`git commit -m 'feat: add new feature'`)
3. Push to the branch (`git push origin feature/new-feature`)
4. Open a Pull Request

---

## 📄 License

MIT License — Free to use, modify, and distribute.

---

## 👨‍💻 Author

**izowooi**

For bug reports or feature requests, please open an [Issue](https://github.com/izowooi/creative-plate/issues).

---

<div align="center">

**⭐ If this project helped you, please give it a Star! ⭐**

Made with ❤️ using faster-whisper + Gradio

</div>
