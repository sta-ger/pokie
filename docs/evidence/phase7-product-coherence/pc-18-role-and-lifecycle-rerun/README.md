# PC-18 role and lifecycle rerun

The retained, repository-local acceptance harness is intentionally split by
public surface:

- `tests/cli/PC18RoleMissions.integration.test.ts` creates clean destinations
  for the math designer, game developer, frontend package consumer, QA,
  integration developer, and new-project developer missions.
- `tests/cli/PC18LifecycleParity.integration.test.ts` compares CLI and Studio
  artifact semantics and proves a stale prepared Studio operation is rejected
  before it publishes a caller destination.
- `tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx` renders
  the routed Studio product against real HTTP and proves a project switch does
  not leave the prior project interactive.

This file describes only checks executable in the isolated implementer clone.
Independent browser captures, clean profiles, command transcripts, and the
controller-owned full gate are retained by the external verifier; they are not
manufactured by this test harness.
