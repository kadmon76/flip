# Decisions log
Append-only. One entry per choice an agent made without asking (per ask-rule).

## 2026-09-18 — /health served without trailing slash only (B-000)
- chose: route `path('health', ...)` so exactly `GET /health` returns 200; `/health/` is not routed (404).
- because: acceptance names `/health` literally; monitors and load-balancer probes hit a fixed string, so one canonical URL is simpler. Redirects (301 via APPEND_SLASH) are not useful for probes, and a trailing-slash-only route would break the acceptance path.
- considered: (a) `path('health/')` relying on APPEND_SLASH to redirect `/health` -> `/health/` (adds a 301, fails "exactly /health"); (b) registering both routes (duplicate names, no real gain).
- reversible: yes (add a second `path('health/')` line if ever needed).
