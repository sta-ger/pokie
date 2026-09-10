# Archive-installed public CLI

An isolated `npm install --ignore-scripts` of the retained archive exposed the
public `pokie` executable. `pokie --help` exited 0 and listed build,
certification, client, create, dev, diff, edit, export, fairness, generate,
import, init, inspect, par, reel, replay, report, sample, serve, sim, and
validate. `pokie definitely-not-a-command` exited 1 with the bounded
unknown-command guidance directing the user to `pokie --help`.
