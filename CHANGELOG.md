# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-04-28

### Fixed
- **Stale-session crash on `/new`, `/fork`, `/resume`, `/reload`** — extension now
  subscribes to `session_shutdown` (pi 0.68.0+) and disposes the open side-chat
  overlay before pi tears down the outgoing session. Previously, `peek_main`
  would call `sessionManager.getEntries()` against a stale context, which throws
  "stale extension context" in pi 0.69.0+.

### Changed
- **About tab reads version from `package.json`** at runtime instead of a
  hardcoded literal, eliminating release-time version drift (was still showing
  `v1.0.0` after the 1.0.1 release).

### Verified
- Pi API compatibility audit against coding-agent CHANGELOG v0.65.0 → 0.70.5
  + Unreleased. No further breaking changes affect this extension:
  - `createReadOnlyTools(cwd)` factory still exported (v0.68.0 removal of
    cwd-bound singletons did not affect the factory form already in use)
  - `ctx.ui.custom()` 4-param signature unchanged
  - `pi.on("session_start" | "session_shutdown", ...)` events stable
  - TypeBox 1.x migration (v0.69.0): kept `@sinclair/typebox` import — pi's
    extension loader still aliases it to bundled `typebox` 1.x at runtime, and
    `typebox` 1.x is not reachable from this extension's dev workspace. No
    code change needed; revisit if pi removes the alias.

## [1.0.1] - 2026-04-03

### Verified
- **Pi API compatibility audit** — verified clean against Pi coding agent
  CHANGELOG (v0.55.0 through Unreleased). No breaking changes affect this
  extension:
  - Uses `getApiKeyForProvider()` (still supported, not deprecated)
  - No `session_switch`/`session_fork` event usage
  - `ctx.ui.custom()` uses current 4-param signature `(tui, theme, kb, done)`
  - `new Editor(tui, ...)` uses current constructor signature
- No code changes required.

## [1.0.0] - 2026-03-27

### Added
- Initial release: side chat overlay with parallel agent and read-only tools
- Settings panel with model picker, width/height configuration
- `Alt+/` keyboard shortcut for toggle
- Shortcut intent expansion (analyze, stuck, recap, status, help)
- Secret/token redaction in chat output
