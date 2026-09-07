# PC-19 blind cold-start transcript (partial)

Candidate reviewed: `7e4bf7cd1178fe59a29f924bb72e92b379b6d444`.

The candidate build completed successfully before the Studio launch. The built
CLI checksum was `ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`.

The fresh-profile public run launched exactly:

```
node ./dist/cli/pokie.js --no-open
```

Rendered workflow evidence from that run:

1. The visible, enabled **Create game** button was activated once from the
   starter design.
2. Its local accepted state rendered: **Save game — Your game was saved.
   Opening its workspace…**.
3. The local terminal surface rendered the **Starter Slot** workspace with
   Overview, Game Model, Play, Simulation, Replay, and Build/Export, and
   showed **Valid — no issues found**.
4. After the visible **Close project** action, the Projects surface rendered
   one available **Starter Slot** project with the action **Open**.

No product failure was observed in this executed path. This is intentionally
partial: the four-launch blind-run limit was reached while repairing the
generic harness, before all six role missions, artifact interoperability,
parity spot checks, player review, packed-artifact receipt, and external freeze
receipt could be completed. Therefore it is not pass evidence.

The three retained browser screenshots are deliberately not copied into the
repository; their source-run checksums are, respectively, initial/workspace/
projects:

```
7b40cd1848ac2e3365e6341c8b2a3a0dc4377dd196cbf92453234d56d7b8bd2d
5945d9ac8779fc400fb1d1896190840cb72857e60233c510c8150f60ca59a896
3b5bbc483900cb0e74031217af99931129b62617d8c20e88aa85f3945ac7d22e
```
