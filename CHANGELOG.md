# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
