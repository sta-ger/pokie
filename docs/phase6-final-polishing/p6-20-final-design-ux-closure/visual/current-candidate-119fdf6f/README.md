# P6-20 current-candidate host browser verification

Candidate: `119fdf6f8f336bfc5f839f5a15cbfcc7ce00be32` (`119fdf6f`)

A locally built Studio was launched once under Node `v24.18.0` with a fresh Chrome profile. The verifier used the public Studio URL and rendered controls only: it selected **Recommended** in **New Blueprint**, entered a unique verification identity, clicked **Create Project**, then used the visible Workspace, Projects, Play, and Replay UI.

Result: **passed**. The Recommended Blueprint was saved as a managed project and opened directly in its Workspace. After closing it, Projects listed it as **Managed** and its visible **Open** action reopened the Workspace. Play started a Studio session and completed a round; Replay loaded that recorded Session Spin with complete, inspectable, and exportable evidence. No P0, P1, or material P2 issue was observed.

The temporary managed Blueprint was removed from the visible Projects registry after capture and its generated directory was deleted. Only this summary and the concise transcript are retained; the policy-flagged rendered-image files and their checksum manifest were pruned in the clean evidence descendant.

The deleted generated `blueprint.json` had SHA-256 `f8fc06fd40fa82895600086c76c3b5b4017645b8ae74b58f0ecc79ce4b68123e`.

The retained transcript records the visible UI actions and observations for the created Workspace, Projects registry, completed Play round, and Replay Session Spin.
