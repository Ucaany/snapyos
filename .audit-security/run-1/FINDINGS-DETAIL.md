# Findings detail

No `confirmed` record exists in this run, so there is no medium/high/critical reproduction to copy here.

Reason: the run had no OS-enforced sandbox (no network namespace, empty allowlisted environment, read-only target mounts, resource limits) and no local database or object store, and delegated verifier agents were unavailable. Under the skill's rules, target code may only be executed inside such a sandbox, and a record may only be promoted to `confirmed` after an independent verifier reproduces the decisive result. Both conditions failed, so the three retained leads are recorded as `needs_validation` in `NEEDS-VALIDATION.md`.

The two `rejected` records (`device.device-status-stored-xss`, `payment.checkout-booth-binding`) are retained in `findings.json` so a later run does not re-litigate them without new evidence. They are not findings.
