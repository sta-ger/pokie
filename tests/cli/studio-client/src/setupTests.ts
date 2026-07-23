import "@testing-library/jest-dom";
import {configure} from "@testing-library/dom";

// Several component tests exercise the app's own real (unmocked) setTimeout-based polling (500ms
// intervals -- see useSimulationPoll/useReplayPoll/the Reel Strip Modeler's stale-response guard).
// RTL's default 1000ms waitFor/findBy* timeout leaves little headroom for a couple of polling cycles
// once several jsdom test suites run as concurrent Jest workers and compete for CPU -- a slow but
// eventually-correct assertion shouldn't fail just because the machine was busy. This raises the
// default for every test in this project; individual tests can still override it per-call.
//
// This cap governs each *individual* waitFor/findBy* call, not the whole test: the workflow-lane
// timeouts observed under the full `check:full` gate (e.g. a draft-restoration findByDisplayValue, a
// navigation-guard findByRole("Leave")) fired here -- the surrounding test still had ample per-test
// budget left. When the full multi-project gate runs the heaviest real-timer suites side by side at
// --maxWorkers=2, a single such assertion can be starved well past 8000ms even though the same test
// passes in seconds in isolation. 15000ms restores headroom for one contended assertion while
// staying comfortably below every per-test testTimeout (the tightest workflow override is 30000ms),
// so raising it can't turn a slow assertion into an overall-test-budget timeout instead.
configure({asyncUtilTimeout: 15000});
