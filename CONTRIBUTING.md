# Contributing to Sentient

Thanks for your interest in improving Sentient. Contributions are welcome.

## Workflow

1. **Fork** the repository.
2. Create a focused **branch** (`git checkout -b fix/source-health-uptime`).
3. Make your change and open a **pull request** against `main` with a clear description of what and why.

## Guidelines

- **Keep changes surgical.** Match the existing patterns, file structure, and style. Small, well-scoped PRs get reviewed and merged faster than large ones.
- **No new npm packages without opening an issue first.** Dependencies add weight and maintenance cost — let's discuss before adding one.
- **Before submitting a PR**, make sure both of these pass cleanly:

  ```bash
  npx tsc --noEmit
  npm run build
  ```

- Don't commit secrets, generated state (`lancedb/`, `agent_memory.json`, `metrics.json`), or `.env.local`.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what actually happened. Console output and the relevant source name (arXiv, GDELT, etc.) help a lot.
