# P6-07 independent host-side verification finding

Candidate `9009f7a09c876f0acb924317898f398eea15318b` was rebuilt with Node
`v24.18.0` and opened through fresh local Studio and Chrome instances.

The rendered PAR workbook project (`examples/parsheets/starter.par.xlsx`) has
only `Overview` and `Game Model` navigation.  It does **not** expose the
`Build/Export` tab.  This makes the `parWorkbook` build card -- the only
Build/Export card with `Output file (optional)`, a native Save dialog, and an
XLSX output -- unreachable through Studio.

The separate blueprint run does expose Build/Export and visibly renders the
directory card, its preflight (resolved path, output type, conflict state, and
planned output), and its `Browse…` action.  Clicking that rendered action
started the real local `zenity --file-selection --directory` process, recorded
in the running-host evidence.  The required matching file-save/XLSX Build/
Export path could not be driven because of the prior product capability gate,
not because of a missing human or external prerequisite.

`par-workbook-rendered.txt` and `simulation-diagnostic.*` are the key rendered
evidence.  `browser-transcript.txt` records the rendered Build/Export visit and
the attempted native directory picker.  Terminal logs contain the fresh build
and Studio launches.
