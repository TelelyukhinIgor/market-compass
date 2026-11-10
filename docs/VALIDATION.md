# Validation record

Publication copy prepared: 2026-11-10.

| Check | Result |
|---|---|
| English application strings | 304 string occurrences translated; source scan found no remaining Cyrillic in project text |
| TypeScript | Passed tsc --noEmit --incremental false against the existing dependency installation |
| Production build | Attempted; blocked by this Mac host rejecting the cached Rolldown native binding's code signature |
| Live data refresh | Not run |
| Telegram delivery | Not run |
| New production deployment | Not run |
| Predictive or trading evaluation | Not run; no performance claims are made |

The build limitation is recorded, not counted as a pass. A fresh compatible dependency installation and production build remain required before deployment. No security protections were disabled to make the native binding load.

Changes from the source snapshot: English UI/API/report text, English locale, Market Compass branding, environment-based owner/viewer identities, placeholder hosting identity, blank initial sources, disabled initial schedule flag, and synthetic chart seed.

The original deployed site and its schedules were not modified.

## Re-verification

After the publication copy was received, the following checks were repeated on a Linux host with Node.js 24.22.1 and pnpm 11.25.0, on 2026-11-10:

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed |
| TypeScript (`pnpm check` / `tsc --noEmit --incremental false`) | Passed |
| Production build (`pnpm build`) | Passed in this environment |
| Live data refresh | Not run |
| Telegram delivery | Not run |
| New production deployment | Not run |
| Predictive or trading evaluation | Not run; no performance claims are made |

The earlier Mac-host Rolldown code-signature failure did not reproduce here. A fresh compatible dependency installation remains required on each machine before deployment.
