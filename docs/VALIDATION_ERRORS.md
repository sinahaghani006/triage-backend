# Validation Error Format

Documents the exact shape of the `details` field on `VALIDATION_ERROR`
responses (400), resolved 2026-07-19. Source of truth: `src/middleware/validateRequest.js`.

## Overall error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "weight", "message": "weight is required" },
      { "field": "weight", "message": "weight must be a valid number of kilograms" }
    ]
  }
}
```

## `details` field contract

- `details` is always an **array** (never omitted, never a single object)
  when `code` is `VALIDATION_ERROR`. For non-validation errors (other
  codes), `details` is omitted entirely.
- Each item is `{ field: string, message: string }` — exactly these two
  keys, nothing else (no `value`, no `location`, no nested objects).
- `field` is the request body field name that failed (e.g. `"email"`,
  `"birthDate"`, `"weight"`) — always a flat string, never a path like
  `"patientDetails.weight"` (validators operate on top-level body fields
  only, per current validator files).
- **The same `field` can appear more than once** in the array if it fails
  multiple rules (see the `weight` example above — both `notEmpty` and
  `isFloat` failed). Consumers must not assume one entry per field.
- `message` is a human-readable English string from the validator chain
  (e.g. express-validator's `.withMessage(...)`), not translated/localized.
- Order of items follows the order validators are declared in the
  relevant `*Validators.js` file, not alphabetical or by severity.

## Consuming this in Frontend

To show one message per field (deduplicated), group by `field` and
either show the first message or join all messages for that field —
this is a Frontend UX choice, not something Backend enforces.