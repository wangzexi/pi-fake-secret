# pi-secret-mask 🔐

**Pi extension that masks real secrets before they reach the LLM, and restores them at execution time.**

The model (缸中之脑) only ever sees lookalike placeholders. The harness maintains a mapping table and swaps values at the bridge boundary — before the model's context, and before bash execution.

```
    user input: "use key sk-live-abc123"
         │
         ▼
  ┌─ input hook ── real → placeholder ──┐
  │                                     │
  │  LLM receives:  sk-live-M_a1b2…     │  ← model thinks this is real
  │                                     │
  │  LLM calls:  curl -H "Bearer sk-live-M_a1b2…"
  │                                     │
  ├─ tool_call(bash) ─ placeholder → real ─┤
  │                                        │
  │  bash executes:  curl -H "Bearer sk-live-abc123"   ✅
  │                                        │
  ├─ tool_result ── real → placeholder ────┤
  │                                        │
  │  LLM sees:  "200 OK" (no real secrets) │
  └────────────────────────────────────────┘
```

## Why

Coding agents have access to your entire workspace — `.env`, config files, credentials, private keys. When you ask an agent a question, those secrets can be sent verbatim to the model provider.

`pi-secret-mask` intercepts at the pi extension boundary:

- **Before** a secret reaches the LLM's context → replaced with a lookalike placeholder
- **Before** a bash command executes → placeholder swapped back to the real value
- **After** a tool result comes back → real values masked again before the LLM sees them

The LLM **never** holds the cleartext. If the model is compromised, hallucinates, or is prompt-injected, there's nothing to leak — it only knows placeholders.

## How it works

### Detection

`pi-secret-mask` ships with built-in regex patterns for common secret formats:

| Pattern | Example |
|---------|---------|
| OpenAI API key | `sk-proj-…` |
| Anthropic API key | `sk-ant-…` |
| GitHub PAT (v1) | `ghp_…`, `gho_…`, `ghs_…`, `ghu_…` |
| GitHub PAT (v2) | `github_pat_…` |
| AWS access key | `AKIA…`, `ASIA…` |
| Stripe live key | `sk_live_…` |
| Stripe test key | `sk_test_…` |
| Slack token | `xoxb-…`, `xoxp-…` |
| JWT | `eyJ…eyJ…` |
| Private key (PEM) | `-----BEGIN … PRIVATE KEY-----` |
| Google API key | `AIza…` |
| GitLab PAT | `glpat-…` |
| SendGrid key | `SG.…` |

### Placeholder format

Placeholders preserve the original prefix so the format stays recognizable:

```
sk-proj-AbCdEfGhIjKlMnOp123456  →  sk-projM_a1b2c3d4e5f6g7h8Op123456
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  →  ghp_M_a1b2c3d4e5f6g7h8
AKIAIOSFODNN7EXAMPLE  →  AKIAM_a1b2c3d4e5f6g7h8
```

The `M_` marker identifies masked values. The random hex suffix ensures uniqueness. The last 4 characters of the original are kept for recognizability.

### Flow

| Hook | Direction | Transform |
|------|-----------|-----------|
| `input` | User → LLM | Real secrets → placeholders |
| `context` | History → LLM | Real secrets → placeholders |
| `tool_call` (bash) | LLM → bash | Placeholders → real values |
| `tool_result` | Tool output → LLM | Real secrets → placeholders |

## Installation

```bash
# From a local path
pi install /path/to/pi-secret-mask

# Or symlink into pi's extension directory
ln -s /path/to/pi-secret-mask ~/.pi/agent/extensions/pi-secret-mask
```

Restart pi or run `/reload` to activate.

## Usage

The extension runs automatically once loaded. No configuration required — it detects secrets by regex patterns and masks them on the fly.

### Commands

| Command | Description |
|---------|-------------|
| `/secret-mask status` | Show active pattern count and mapping stats |
| `/secret-mask list` | Show all registered secret→placeholder mappings |

### Example

1. Create a test `.env` file:
   ```
   OPENAI_API_KEY=sk-proj-AbCdEfGhIjKlMnOp123456
   ```

2. Ask pi to read it:
   ```
   > read the .env file
   ```

3. pi returns:
   ```
   OPENAI_API_KEY=sk-projM_a1b2c3d4e5f6g7h8Op123456
   ```
   The model sees the placeholder but understands the structure.

4. Ask pi to use that key in a curl command. The extension swaps the placeholder back before bash executes — the real key reaches the API. The model never sees it.

## Development

```bash
git clone https://github.com/wangzexi/pi-secret-mask
cd pi-secret-mask
# Edit index.ts, then test with:
pi -e ./index.ts
```

## Limitations

- **Only literal string replacement.** If the model stores a placeholder in an environment variable and references it via `$VAR`, the extension cannot intercept the indirection. The command must contain the placeholder as a literal string.
- **Pattern-dependent.** Secrets in formats not covered by the built-in patterns pass through unmasked. Add custom patterns if needed.
- **Best-effort redaction.** The extension cannot prevent every possible side channel (e.g., timing, error messages). It is a practical safety measure, not a cryptographic guarantee.
- **Not a sandbox.** This extension operates at the pi event layer. For kernel-level egress control, combine with sandboxing tools.

## License

MIT
