# P7-16 corrected installed public-CLI interoperability rerun

This is an independent rerun against candidate `3bddfa6edc2b917c8b1f0938b621df8061815e72`. The candidate source was packed, then installed into a fresh temporary consumer; every product command used that consumer's `node_modules/.bin/pokie` executable.

The retained machine-generated [transcript](transcript.txt) records commands, exit codes, provenance, semantic checks, diagnostics, and SHA-256 checksums only. No generated inputs or outputs are retained.

Results:

- Direct and generic PAR exports/imports produced structurally identical Blueprints; the direct XLSX archive passed ZIP integrity.
- POKIE-produced Stake output reconstructed through both direct and generic import, and re-exported index, lookup, and books matched exactly by SHA-256.
- An independently supplied compatible Stake directory without `pokie-manifest.json` succeeded through `report --format json --out`, `stakeengine analyze`, and `stakeengine diff`; all output artifacts were parsed and checked. Generic reconstruction correctly failed with actionable filename and missing-manifest diagnostics.
- Malformed workbook input failed without output, while malformed foreign Stake input rendered the canonical actionable structural issue.
