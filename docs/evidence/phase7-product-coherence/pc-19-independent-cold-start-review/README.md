# PC-19 independent cold-start review

Candidate: `c5a1465929abc122612409b62cfbff20386a9e29`.

The retained archive is the exact packed candidate, SHA-256
`0ecc0cd77ad17f4491ba9022a64c91a89353cc583661f31fd4537fd5648636ef`.
`PROVENANCE.json`, `coverage.json`, the frozen register, and the strictly
post-freeze comparison are schema-validated by
`scripts/pc-19-independent-cold-start-review.mjs` against the verifier-owned
receipt outside this mutable directory.

The concise Studio transcript records fresh-profile Create → Play/Spin →
Simulation → Replay → Build/Export. Its package-opening delta built a
TypeScript Game Package and used that same card's **Open as Project**; the
opened project was not a PAR workbook. It then closed back to the project list.
