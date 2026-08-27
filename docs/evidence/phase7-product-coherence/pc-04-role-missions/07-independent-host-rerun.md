# PC-04 independent host rerun — 2026-08-27

Candidate `276283cf2b3dec3721e8a0c625b7c557fddc3b5e`, public candidate
entrypoint `node ./dist/cli/pokie.js`. Before this transcript was frozen, this
run did not read `src/`, tests, or the existing PC-04 evidence. Each CLI mission
used a new directory; Studio used a newly-created browser profile.

| Fresh role context | Natural public actions and read result | Created/read artifact checksum |
| --- | --- | --- |
| Math designer | `create --random --seed 42`, `par export`, `par import`, `inspect`, `validate`: the imported editable Game Blueprint was valid and offered package, Outcome, Stake, and PAR actions. | `math.par.xlsx` `sha256:7ad70a3344a9657e0af78f2bfc150b0210fe85bde4895dd201d6591646124b5a`; imported Blueprint `sha256:4366160479c7f01614f4c3b2876a0cec0f78e20558b25f213b636c5cd3a762b2` |
| Runtime developer | `create --random --seed 43`, `build --target tsPackage`, `inspect`, `sim --rounds 80 --seed pc04-runtime`, `report`: a runnable package and JSON/Markdown simulation report were written. The visible report recorded 80 rounds, 33.75% RTP, and the reproducible seed. | `dist/index.js` `sha256:f3ab7c842032a2b38857ae65cfefc339e72079f59be47f00982afc44e6a9ed67`; `simulation.json` `sha256:84e3feb4baefe11c76e6f9915c08bd70bd58492a0788d578e91f9aa6c2296289` |
| Integration developer | `create --random --seed 44`, `build --target outcomeLibrary`, `inspect`, `build --target stakeAdapter`, `inspect`, `report`, `import`: Outcome and Stake artifacts were created and read. Reuse failed: `import` wrote `config.json`, `libraries/base.json`, and `source-provenance.json`, but `inspect` called that output unsupported and `validate --deep` failed because `manifest.json` was missing. | Outcome manifest `sha256:e7414d0446393fab8b83615c26649265476c938d24a748fd3dc2920b8ba5e587`; Stake manifest `sha256:2bf5acaf4f5adcf9b7d64cfa927467fc9c79dcfab311bedbbc6b190a72053a5a`; reused `config.json` `sha256:d1fa6f8610b2468fa9825da511abb4f189913e5b9cc7ed719ada0a2c3bef55b4` |
| Analyst | `create --random --seed 45`, `build --target outcomeLibrary`, `report --format json`: an exact outcome analysis was written and read (one base mode, RTP 24.7942%, hit frequency 10.6524%). | `analysis.json` was 2,829 bytes; no generated artifact retained. |
| Publisher | `create --random --seed 46`, `build --target parWorkbook`, `inspect`: a real PAR workbook was created and Studio/CLI-oriented next action was `par import`. | `publisher.par.xlsx` `sha256:773b316da4ee6a2cffbc98363a537ecde10a4e647fb5a38ec264156bede784f1` |
| Developer opening another project | Fresh Studio at `node ./dist/cli/pokie.js --no-open`: rendered landing view identified **Start a game**, **Projects**, editable starter game, automatic validation, preview, docs, and file/JSON tools. Selecting **Choose a different start** after opening the advanced tools rendered an unsaved-design dialog with **Cancel**, **Discard**, and **Save and continue**; choosing rendered **Discard** recovered to the four explicit starts (starter, blank, generated, saved design). | Rendered UI observations were frozen in the isolated verifier harness; no profile or screenshot was retained in the repository. |

## Journey conclusions

The math journey completed with real files: PAR workbook -> imported editable
Blueprint -> TypeScript runtime package -> simulation JSON/Markdown report. The
Outcome -> Stake deployment portion completed with real files, but its advertised
reuse journey did not: the public import output is not accepted by the public
`inspect` or `validate` commands. This is retained as a product finding, not
repaired or hidden by a private workflow.

Studio supplied clear initial orientation and an on-screen stale/unsaved-design
recovery path. No rendered product error occurred during that recovery.
