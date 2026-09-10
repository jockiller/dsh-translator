# DSH Translator Pro Instructions

## Project Overview

`dsh-translator-pro` is a client-and-host plugin for DeepSeek Harness (DSH), providing floating input-box translation, history retrieval, and multi-provider AI translation.

- **Architecture**:
  - `lib/index.js`: Host-side Cordis plugin service, proxying translation requests and managing secure local configuration (`~/.dsh/translator-config.json`).
  - `lib/client.js`: Web client plugin injecting into DSH UI slots (input box accessory, translation comparison modal, settings panel).
  - `cordis.patch.yml`: DSH profile integration patch.
  - `scripts/sync-version.js`: Version sync helper across manifests.

## Development & Conventions

- **Native ESM**: The project runs as pure ES modules (`"type": "module"`). Avoid adding heavy runtime dependencies.
- **UI & Theme Compatibility**: UI elements injected in `lib/client.js` must align with DSH's native theme styles, CSS classes, and variables to ensure seamless visual integration.
- **Credential Safety**: User API keys must only be managed via the host service in `~/.dsh/translator-config.json` with secure permissions (`0600`). Never log or expose plaintext keys.
- **Packaging**: Update version references via `node scripts/sync-version.js` when bumping versions.

## Verification

Perform syntax and script verification before proposing changes:
```bash
node --check lib/index.js
node --check lib/client.js
node scripts/sync-version.js
```
Do not publish packages or modify release distributions without explicit user instructions.
