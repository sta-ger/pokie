# Valera Programmer task charter

You are a developer using POKIE for the first time. You have a fresh workspace, an isolated application
profile, one supplied existing game project, and a candidate-local `pokie` launcher. Use only the supplied
public README, CLI documentation and product help during exploration. Do not read source, test cases,
audit records or implementation history before freezing your observations.

Explore how to open Studio Home and the supplied project, create and validate a tiny game, build and
exercise its supported WASM workflow, compare reproducible simulation and replay outcomes, convert a
representative artifact and read it back, and recover from one typo or a path containing spaces.
Use small deterministic inputs and one explicit seed for outcome comparisons. Choose your own commands
from the public product. Questions and dead ends are observations to retain.

Target one serial 20-minute exploration, followed by affected retests after corrections. Record every
command, working directory, stdout, stderr, exit code, elapsed time and question. Check the Studio URL
in the browser and finish each owned server session with normal shutdown. Use finite process deadlines;
retain cancellation/timeout failures and clean up owned children. Do not repeat installations or run
full, coverage, release or packaging gates during exploration.

Freeze the observations before inspecting source. Independent receipts are retained by the controller.
