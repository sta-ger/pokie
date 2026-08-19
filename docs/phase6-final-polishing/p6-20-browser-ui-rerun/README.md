# P6-20 independent Player-presentation rerun

Candidate `7d13394a0484946de11e3ac624b30a648482f15c` was built under Node 24.18.0 and driven in a fresh Chrome profile using only visible rendered controls, coordinate clicks, and keyboard entry. The rerun used `fixture-slot`, `fixture-round`, round 1.

The generated package `npm start`, standalone `pokie serve` + `pokie client`, `pokie dev`, Studio Play, Studio Replay, and the public `pokie-examples` workflow all visibly produced the same Player result: `A/C/A | A/A/C | A/A/A`, highlighted `0:0/0:1/0:2`, `A=5/B=3/C=1`, credits `1004`, win `5`, bet `1`, and `5x`, without a feature counter.

In the standalone client, an unseeded prior round was first rendered. After entering `fixture-round` and pressing **Start new session**, **Spin** was visibly disabled during boot. Once the seeded session became ready, its visible Spin produced the fixture result rather than the prior grid.

Only this README and the concise [verification transcript](verification-transcript.txt) are retained. Temporary generated package, local services, browser profiles, screenshots, raw logs, and the browser-driving source were removed after capture.
