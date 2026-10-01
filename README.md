# llama-studio

A desktop runtime manager for [llama.cpp](https://github.com/ggml-org/llama.cpp).
Detect your hardware, install the right llama.cpp build, download GGUF models,
launch `llama-server` with saved profiles, and benchmark engines against each
other — without hand-editing command lines.

Built with Electron, React, TypeScript and SQLite.

## Features

- **Guided onboarding** — checks your system, finds existing llama.cpp installs,
  picks a binary and a starter model.
- **Hardware detection** — CPU, RAM and GPUs/VRAM, used to recommend a build.
- **Engines** — install llama.cpp releases (CPU, CUDA, Vulkan, Metal, …),
  discover builds already on your machine, and see their health and version.
- **Model library & registry** — browse a curated list of GGUF models or search
  Hugging Face, then download them with a queue, resume support and
  hash verification.
- **Launch profiles** — save `llama-server` flag sets and run/stop them from the UI.
- **Bench** — compare engine × device × model results (e.g. CUDA vs Vulkan vs CPU)
  on a leaderboard.

## Install

Download the latest build from the
[Releases page](https://github.com/Th3Light-Team/llama-setup/releases/latest).

| Platform | File | Notes |
|---|---|---|
| Windows (x64) | `llama-studio.Setup.<version>.exe` | The installer is not code-signed, so Windows SmartScreen may warn: choose *More info → Run anyway*. |
| Linux (x64) | `llama-studio-<version>.AppImage` | `chmod +x llama-studio-*.AppImage && ./llama-studio-*.AppImage`. Needs FUSE 2; if it is missing, run with `--appimage-extract-and-run`. |

**NVIDIA GPUs (CUDA):** llama.cpp's CUDA builds do not include the CUDA runtime libraries
(cudart/cuBLAS). llama-studio picks the newest CUDA build your driver supports and also
downloads the matching runtime bundle (about 150–600 MB more) into the same folder,
unless a matching CUDA toolkit is already installed on the machine.

macOS is configured in `package.json` but is not built by the release workflow yet.

## Build from source

Requires Node.js 22+ and a toolchain able to compile native modules
(`better-sqlite3`): build-essential/python3 on Linux, Visual Studio Build Tools on Windows.

```bash
git clone https://github.com/Th3Light-Team/llama-setup.git
cd llama-setup
npm ci
npm run dev        # run the app in development mode
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Compile main, preload and renderer into `out/` |
| `npm run dist -- --linux` / `--win` | Package an installer into `release/` |
| `npm test` | Run the Vitest suite |
| `npm run lint` | Run ESLint |

## Releasing

Pushing a tag that starts with `v` runs
[`.github/workflows/release.yml`](.github/workflows/release.yml), which tests and
builds the Windows and Linux packages and attaches them to a GitHub Release.

```bash
git tag v0.1.1 && git push origin v0.1.1
```

## Project layout

```
src/main/       Electron main process (IPC, SQLite, downloads, bench runner)
src/preload/    Context bridge between main and renderer
src/renderer/   React UI (pages, components, Zustand stores)
src/core/       Process-independent logic: detection, discovery, engines, binaries
src/tests/      Vitest tests
```

Design notes live in [DOWNLOAD_SYSTEM_PLAN.md](DOWNLOAD_SYSTEM_PLAN.md) and
[ENGINES_AND_BENCH_PLAN.md](ENGINES_AND_BENCH_PLAN.md).

## License

[MIT](LICENSE)
