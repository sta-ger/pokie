# P6V-04 independent host observation

Candidate SHA: `96046beb7dc6a3ca62ab9a6c684c4b52c5d2a22d`  
Date: 2026-08-23  
Method: fresh-profile, visible Chrome Studio UI launched from this checkout with `node ./dist/cli/pokie.js --no-open`.

## Reproduced observation

1. The fresh Home screen said that **Create Project saves it and opens the Workspace**.
2. Clicked its rendered **Create Project** button once.
3. The rendered response stayed on **Design Your Game**, renamed the control to **Save Project**, and reported only: `Saved to "/home/stager/Documents/POKIE Projects/starter-slot-115/blueprint.json".`
4. No Workspace, Game Model, Play, Simulation, Replay, or Build/Export controls rendered after that action.

The isolated generated project was removed after observation. This is concise failure proof only; no generated project, browser profile, automation, or full log is included.
