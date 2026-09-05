# PC-17 CLI/Studio parity and product-semantic audit

This record reruns the PC-05 product model against the post-PC-16 product.
It is a contract audit, not a second command inventory: a CLI spelling and a
Studio affordance may differ when they lead a person to the same supported
domain result through the same boundary.

## Scope and conclusion

Every PC-05 domain row and public CLI route was traced through its resolver,
capability, conversion, runtime, or outcome-source boundary. The audit found
no unexplained CLI/Studio semantic mismatch. The intentional differences are
recorded in [CAPABILITY-PARITY.md](CAPABILITY-PARITY.md); in each case the
Studio affordance either invokes the named shared service or gives the same
user-visible result as the CLI without exposing an implementation adapter.

[PRODUCT-SEMANTICS.md](PRODUCT-SEMANTICS.md) records the user-goal audit. In
particular, it distinguishes a CLI raw outcome JSON/checkpoint handoff from a
Studio-generated canonical bundle, makes process-local job/download retention
explicit, and confirms that downloads/reports are delivery results rather
than project inputs.

The exact candidate and controller-owned full-gate result are to be recorded
by the orchestrator after it integrates this focused implementation commit.
`npm run check:full` is deliberately not run in this worktree: the campaign
policy reserves that official gate for the controller.
