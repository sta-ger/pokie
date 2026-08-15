# P6-02 browser runtime isolation

Candidate `a53f3c2a39f0fec7d24bbf3a76e362a833c5afa4` was freshly built and
exercised through public Studio controls in a clean Chrome profile. The final
successful transcript records the visible Project A → Project B → browser
Back/Forward workflow. The two captures show the final scoped A and B Play
destinations, each without the other project's playable state.

- `candidate.txt` identifies the candidate and runtime.
- `browser-workflow-transcript.txt` is the successful browser interaction trace.
- `back-project-a.png` and `forward-project-b.png` are the final rendered
  route-isolation captures.
- `CHECKSUMS.sha256` verifies the retained evidence payload.
