# P8-05 Studio runtime rerun — inconclusive

Candidate `3ba937f9b27916bb64afa49184fcab597d0c93b8` was built and launched from this checkout with `node ./dist/cli/pokie.js --no-open`, using a fresh browser profile and isolated runtime data.

The visible Design flow accepted the game id and reached a valid state. The supplied rendered journey could not continue because its required `Create Project` control was not rendered; Studio showed `Create game` instead. No rendered product error occurred. The two allowed public-workflow launches were consumed (the first was stopped before browser interaction because this host provides Chromium as `/snap/bin/chromium`, and the second reached the selector mismatch), so no further browser launch was performed.

`ACTION-TRANSCRIPT.txt` contains the bounded observed UI evidence. No project, export, profile, generated output, or raw browser log is retained.
