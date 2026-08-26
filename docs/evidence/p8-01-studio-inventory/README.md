# P8-01 Studio inventory and Valera evidence protocol

`inventory.json` is the machine-readable, browser-captured baseline.  It is
deliberately a small record of visible product output, not a copied route table
or source-code inventory.  The collector starts with both a fresh Chromium
profile and a fresh Studio registry, follows rendered controls from Studio's
public URL, and records the resulting visible screens, controls, dialogs,
alerts, focus order, latency, and browser console/network errors.

Run it only after building the candidate:

```sh
npm run build-cli
node scripts/collect-studio-inventory.mjs \
  --output docs/evidence/p8-01-studio-inventory/current-run
```

The collector does not retain screenshots.  A later owner may add one only
when text cannot establish a visual relationship (for example, a focus ring,
responsive overflow, or the relative position of an error and its action).
Keep the written transcript and `inventory.json`; do not retain the temporary
browser profile, Studio config, build products, or generated project.

## Ownership closure

Every finding, including an observation whose capability was not reachable
from the clean-run project, must appear in `surface-owners.json`.  P8-07 is
the only residual bucket: it may close only when its `unownedFindings` array
is empty.  A newly discovered capability is a finding first; assigning it to
P8-07 without recording it is not ownership.

The detailed collection contract is in [PROTOCOL.md](PROTOCOL.md).
