# PC-11 Studio duplicate-capability audit

## Retained owners

| User goal | Retained Studio owner | Retired route behavior |
| --- | --- | --- |
| Build or republish an artifact | Project Dashboard **Build/Export** and `StudioArtifactBuildService` | `/project/deployment`, `/project/stakeEngineExport`, and `/project/outcomeLibraries` redirect to Build/Export with migration guidance; no retired workflow mounts. |
| Exchange a PAR workbook | Guided Blueprint editor PAR panel and `StudioBlueprintService` | Remains distinct from artifact-plan PAR republishing: editor exchange works on the current Blueprint and preserves import provenance. |
| Validate a project | Overview diagnostics and `POST /api/project/validate` | `/project/validate` and `/project/validation` redirect to Overview with recovery guidance. |
| Build certification evidence | Certification tab and `StudioCertificationService` | Independent verification is an explicit handoff to `pokie certification verify <certDir> --source <bundleDir>` from the project directory; the source must remain available and unchanged, otherwise rebuild. |
| Deploy | Build/Export Remote delivery and `StudioDeploymentService` | Uses the shared `librarySelector` contract; preview and publish remain distinct (`publish: false` / `true`). |

## Contract checks

The browser tests named by this step exercise the retained Build/Export and Certification entrypoints, verify
the legacy route migration message, and assert that the removed components are not mounted. The API reference
documents the live `librarySelector` request rather than the obsolete `libraryPath` shape.

The broader service, job-lifecycle, selector-containment, cancellation, and project-switch closure remains
covered by the PC-11 targeted test set declared in the roadmap step; this audit records route ownership and
the observable migration/handoff contract rather than treating screenshots as proof.
