import "@testing-library/jest-dom";
import {configure} from "@testing-library/dom";

// Several component tests exercise the app's own real (unmocked) setTimeout-based polling (500ms
// intervals -- see useSimulationPoll/useReplayPoll/the Reel Strip Modeler's stale-response guard).
// RTL's default 1000ms waitFor/findBy* timeout leaves little headroom for a couple of polling cycles
// once several jsdom test suites run as concurrent Jest workers and compete for CPU -- a slow but
// eventually-correct assertion shouldn't fail just because the machine was busy. This raises the
// default for every test in this project; individual tests can still override it per-call.
configure({asyncUtilTimeout: 8000});
