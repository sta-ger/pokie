# P6-20 independent visual/product-design audit

Candidate `acab3128c79f2a92b1ff328be269a0aac34b099e` was built, then served once from this checkout with `node ./dist/cli/pokie.js --no-open`. A fresh Chrome profile drove only public Studio URLs and rendered mouse/keyboard controls. The host had no graphical display, so Chrome rendered headlessly; screenshots are Chrome-rendered UI, not DOM fabrication.

The supplied read-only `pokie-examples` companion was clean at required HEAD `6bb67dee3d2e8e98bab754e1000019701a17266b` before and after the run.

Result: **P2 finding**. Selecting **Per-reel (Reel Strip Modeler)** from the valid Recommended Blueprint silently replaces all five populated literal strips with empty strips. The model immediately shows nine errors and Create Project cannot proceed. The clear validation text prevents a bad save, but the destructive mode switch has no warning, conversion, or recovery affordance.

The retained PNGs are all below 0.5 MiB; no generated project/output tree, browser profile, raw log, or automation script is committed.
