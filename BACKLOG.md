# Flip — backlog (dry-run)

Agents take the first item that has no `blocked:` and no `done:`.

## M0 — plumbing test
### B-000 Add a health endpoint
- why: prove the agent loop end to end
- acceptance: GET /health returns JSON {"ok": true}; a test covers it; screenshot of the JSON in a phone-size browser exists
- status:
