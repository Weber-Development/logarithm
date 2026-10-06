---
"@sweberdev/logarithm": patch
---

Security: redaction now matches sensitive field names regardless of case and of `_` and `-` separators, so `access_token`, `api_key`, `client-secret` and `Authorization` are no longer stored. Before, only the camelCase spellings in the default list were redacted. More names are redacted by default (`authorization`, `clientSecret`, `secretKey`, `passphrase`, `sessionToken`, `cookie`, `currentPassword`, `newPassword`, `oldPassword`, `passwordConfirmation`). Names you pass as `redact` are matched the same way.
