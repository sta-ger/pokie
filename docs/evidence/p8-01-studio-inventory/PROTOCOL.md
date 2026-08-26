# Bounded Valera browser-evidence protocol

Valera is a first-time Studio user.  Start at the public Studio URL with a new
browser profile and a new Studio registry; do not seed browser storage, paste
routes found in source, or infer a screen from component names.  Public docs
are read before the run to state a goal, never to manufacture a route.

For each goal, record only: the goal, the public entrypoint or rendered action
used, the visible result, elapsed observation time, rendered controls/dialogs/
alerts, keyboard Tab order, responsive viewport, and console/network errors.
The collector's 12,000-character text, 160-control, and 40-focus limits keep
one run reviewable.  Record failures as observations; do not hide a failing
screen by replacing it with a fixture.

Use desktop (1280px) and narrow (405px) profiles.  Screenshot only when the
claim is spatial: focus visibility, overflow, ordering, or an error/action
relationship.  Link the image from the matching finding, record its viewport,
and otherwise retain text only.  Never retain profiles, generated game trees,
or browser caches.

An independent rerun must use a separately-created profile/configuration and
record its candidate commit, command, timestamp, viewport, result, and any
console/network errors.  Compare it to the prior JSON by user goal and visible
control labels, not by implementation route.  Public documentation claims are
recorded as claims with the document URL/path and checked against a rendered
user path; a claim that cannot be observed is owned as a finding rather than
treated as proof.

## State coverage

For each reachable workflow, collect the first usable screen plus: empty,
loading, success, warning, error, disabled action, modal/native picker where
offered, keyboard focus order, and desktop/narrow behavior.  Persisted project
or artifact state must be checked after reopening Studio.  Performance claims
are observations, not benchmarks: report the visible operation and observed
latency, hardware/browser context, and whether an error occurred.
