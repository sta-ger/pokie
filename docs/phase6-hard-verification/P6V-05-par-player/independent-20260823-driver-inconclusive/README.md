# P6V-05 independent host attempt — driver inconclusive

Candidate product SHA: `caf8132177b23abc34096c6c3ce4079330b34080`  
Companion candidate SHA: `1e2c8c00457f3af389c0168432c08e63ca441465`

The candidate was built successfully, then Studio was launched from this checkout with exactly:

```text
node ./dist/cli/pokie.js --no-open
```

Fresh Studio/Chrome state rendered `POKIE Studio`. The visible `Design Game` workflow then created a Recommended project, rendered `Saved to`, and opened the `Overview` workspace. The harness then navigated to the rendered `Play` tab, but incorrectly treated the tab label as the round-start control and waited for a round result. No rendered product error appeared. The interaction was therefore not a valid Play execution and provides no product finding.

The URL-extraction repair and this failed control resolution consumed the two permitted launches. No additional Studio, Chromium, dev-server, build, test, or workflow process was started. Consequently the native-picker XLSX physical round trip and cross-repository parity matrix are not reached.

Bounded rendered proof: `studio-home.png` (84 KiB; SHA-256 `7b88c2d0ad219a6cabc83ecc9feeb1a1747a88bc58d650e85b20476c40a5f954`). Runtime logs and profiles remain outside this commit.
