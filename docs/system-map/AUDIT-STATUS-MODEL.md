# Audit Status Model

## Execution status
`NOT_STARTED | IN_PROGRESS | COMPLETED`

## Result
`PASS | FAIL | BLOCKED | null`

Use `null` while no final stage result exists.

## Health
`PASS | FAIL | BLOCKED`

Health answers: "Is there a known failure/blocker right now?"
Result answers: "What was the outcome of the completed audit stage?"

Examples:

```json
{"status":"COMPLETED","result":"PASS"}
```

```json
{"status":"IN_PROGRESS","result":null}
```

```json
{"status":"COMPLETED","result":"FAIL"}
```

This separation prevents `PASS` from meaning both "completed successfully" and "no failure observed yet".
