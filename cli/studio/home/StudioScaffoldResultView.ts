import type {PokieGameManifest} from "pokie";

// The plain-data DTO both POST /api/home/projects/create and POST /api/home/projects/init return —
// GamePackageCreator's and GamePackageScaffolder's ScaffoldResult shapes are already identical, so this
// is the one view both flows share (see StudioHomeService.createProject()/initProject()). "error" never
// carries a stack trace — only GamePackageCreating/GamePackageScaffolding's own safe Error message.
export type StudioScaffoldResultView =
    | {
          status: "ok";
          projectRoot: string;
          manifest: PokieGameManifest;
          createdFiles: string[];
          updatedFiles: string[];
          skippedFiles: string[];
      }
    | {status: "error"; error: string};
