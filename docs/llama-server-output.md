# llama-server output: grounding and Summary view proposal

Grounding for the Launch → Run console. Two sources:

1. **Real capture** from `llama-server` build `b11819-cuda-cu13.4-x64` (the engine installed on the dev machine), model `Llama-3.2-3B-Instruct-Q4_K_M.gguf`, `-c 2048`, default slots. Saved as [src/tests/fixtures/llama-server-b11819.stderr.log](../src/tests/fixtures/llama-server-b11819.stderr.log).
2. **Source** of the same tag, `tools/server` and `common/log.cpp` on `ggml-org/llama.cpp@b11819`. File references below point there.

The formats are not a stable API. Anything the parser depends on should be checked against the engine version (`system_fingerprint` in responses reads `b11819-<hash>`).

## What the output looks like

Everything arrived on **stderr**; stdout was empty in this build. The launcher already pipes both streams into the console (`src/core/launcher/server.ts`, `emitLog`).

```
0.00.001.514 I srv  llama_server: initializing ...
0.00.119.006 W srv  llama_server: security: no API key is set and CORS allows all origins (see https://github.com/ggml-org/llama.cpp/pull/25655)
0.00.120.850 I srv    load_model: loading model '/home/.../Llama-3.2-3B-Instruct-Q4_K_M.gguf'
0.08.981.640 I cmn          init: llama threadpool init, n_threads = 12
0.09.109.001 I srv    load_model: initializing, n_slots = 4, n_ctx_slot = 2048, kv_unified = 'true'
0.09.118.812 I srv  llama_server: model loaded
0.09.118.820 I srv  llama_server: listening on http://127.0.0.1:8099
0.10.058.260 I slot get_availabl: id  0 | task -1 | selected slot by LRU, n_tokens = 0, t_last = -1
0.10.058.461 I slot launch_slot_: id  0 | task 0 | processing task, is_child = 0
0.10.682.602 I slot print_timing: id  0 | task 0 | prompt eval time =     213.94 ms /    42 tokens (    5.09 ms per token,   196.32 tokens per second)
0.10.682.610 I slot print_timing: id  0 | task 0 |        eval time =     410.15 ms /    11 tokens (   41.02 ms per token,    24.38 tokens per second)
0.10.682.611 I slot print_timing: id  0 | task 0 |       total time =     624.09 ms /    53 tokens
0.10.682.618 I slot print_timing: id  0 | task 0 |    graphs reused =         10
0.10.682.619 I slot print_timing: id  0 | task 0 |   graph reallocs =          0    /     0        (same size) / (changed size)
0.10.682.664 I slot      release: id  0 | task 0 | stop processing: n_tokens = 52, truncated = 0
0.10.692.128 W srv    operator(): got exception: {"error":{"code":400,"message":"[json.exception.parse_error.101] ...","type":"invalid_request_error"}}
0.11.739.408 I srv    operator(): operator(): cleaning up before exit...
```

### Line format

`<timestamp> <level> <module> <message>`, from `common/log.cpp:124-141`:

- **Timestamp** `M.SS.mmm.uuu`: minutes, seconds, milliseconds, microseconds since start. `0.08.981.640` is 8.98 s. Read it as elapsed time, not wall-clock.
- **Level**: `I` info, `W` warn, `E` error. (`common/log.cpp:` `GGML_LOG_LEVEL_*` mapping.)
- **Module** (left column, padded): `srv` server, `cmn` common params, `slot` per-slot task work. Lines can continue without a prefix (`GGML_LOG_LEVEL_CONT`); treat them as continuations of the previous event.
- **Colors**: `common/log.cpp` emits ANSI codes. The launcher's pipe output in this capture had none, but the parser should strip `\x1b[...m` anyway.

## Event catalog

| Event for the UI | Log pattern (verbatim) | Source |
|---|---|---|
| Starting | `srv llama_server: initializing ...` | `tools/server` |
| Loading | `srv load_model: loading model '<path>'` | `server-context.cpp:1221` |
| Slots | `srv load_model: initializing, n_slots = N, n_ctx_slot = N, kv_unified = '<bool>'` | `server-context.cpp:1462` |
| Threads | `cmn init: llama threadpool init, n_threads = N` | `common` |
| **Ready** | `srv llama_server: model loaded` | `server.cpp:521` |
| **Listening** | `srv llama_server: listening on http://<host>:<port>` | `server.cpp:548` |
| Request start | `slot launch_slot_: id N \| task T \| processing task, is_child = 0` | `server-context.cpp:1924` (`launch_slot_with_task`) |
| **Request done (metrics)** | `slot print_timing: id N \| task T \| prompt eval time = X ms / P tokens (… Y tokens per second)` and `eval time = … / G tokens (… Z tokens per second)` | `server-context.cpp:702-736` |
| Request done | `slot release: id N \| task T \| stop processing: n_tokens = K, truncated = 0` | `server-context.cpp:646` |
| Slot choice | `slot get_availabl: id N \| task -1 \| selected slot by LRU, n_tokens = 0` | `server-context.cpp:1847` |
| Warning | `srv llama_server: security: no API key is set and CORS allows all origins` | `server.cpp:360` |
| HTTP error | `srv operator(): got exception: {"error":{"code":400,…}}` (logged as WRN) | `server.cpp:85` |
| Stopping | `srv operator(): operator(): cleaning up before exit...` | `server.cpp:448`, `:488` |

Plus the terminal lines the launcher writes itself (`[Process exited with code N]`, `[Stopping server...]`).

### Metrics for the tiles

From the `print_timing` block of one request:

- prompt: `P` tokens at `X` tokens/s (`prompt eval time`)
- generation: `G` tokens at `Z` tokens/s (`eval time`)
- total: `total time` in ms

Only `eval time` and `prompt eval time` carry tokens/s. The `graphs reused` and `graph reallocs` lines are diagnostics; show them only in the Console tab.

## Proposal: two tabs, top right of the console panel

- **Summary** (default, the new friendly view)
- **Console** (today's raw output, unchanged)

### Summary layout

1. **Status chip** in the header: `Starting` · `Loading model` · `Ready :8080` · `Serving` · `Error` · `Stopped`. Ready and error come from the events above.
2. **Tiles row**, each tile a card with one number and a short label:
   - Model: filename, quantization chip (`Q4_K_M`, parsed from the filename), size
   - Context: `n_ctx_slot` and slot count
   - Last request: prompt tokens/s and generation tokens/s
   - Uptime: from the timestamp of the last line
3. **Notification feed** (right column or below): one card per event, colored by level. Warnings amber, errors red, info neutral. Each card has a title, a one-line detail, and the timestamp. Example: `Listening on :8099`, `Security: no API key set`, `Request failed (400): invalid JSON`.
4. **Activity sparkline**: tokens/s of the last N requests, to make the "web feel".
5. **Raw line link** on each card: jumps to the matching line in the Console tab.

Decisions to confirm before building:

- Parser: a pure module `src/core/launcher/log-parser.ts` that turns lines into typed events. It is tested against the fixture above, and tests run in `npm run test:dev`.
- Store: the renderer keeps the same `logs` array and derives the summary from it, so nothing changes in the process layer.
- Unknown lines are kept but not shown as cards, so new llama.cpp versions degrade to the Console instead of breaking.

## Finding: the default port

Launched without `--port`, this build listened on `http://127.0.0.1:9931`, not on 8080. The launcher had been omitting `--port` when it matched its own default, so its status showed `:8080` while the server listened on `:9931`. `--port` is now always passed (`alwaysEmit` in `src/core/launcher/flags.ts`). Take the port from the `listening on` line rather than from the flags whenever the two can differ.
