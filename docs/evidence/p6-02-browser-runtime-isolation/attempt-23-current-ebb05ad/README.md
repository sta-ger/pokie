# Attempt 23 — current-candidate browser verification blocked by host capacity

Candidate: `ebb05ad3def96da58985407b7895eb31df90d8e2`.

This independent attempt rebuilt the Studio client, started a fresh Studio
process rooted at Project A, and launched a fresh Chrome profile. It used the
same pre-existing visible-input-only browser driver as the prior audit; that
driver observes rendered controls and sends ordinary mouse and keyboard input,
without Studio API calls or DOM/state injection.

The host could not provide the threads/processes required to run Chrome and the
Node CDP driver concurrently. `02-chrome.log` records the resulting
`pthread_create: Resource temporarily unavailable` failures. In
`attempt-22`, Node then aborted while creating its delayed-task scheduler. In
this attempt Chrome terminated before the driver could connect. These are host
resource failures, not observations of a Studio acceptance failure. The
captured runtime, readiness, process, shutdown, and candidate-diff files are
included so the attempt can be reproduced after capacity is available.

No screenshot or browser transcript was fabricated: neither artifact was
created because the browser was unable to sustain a usable renderer on this
host.
