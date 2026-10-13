import fs from "node:fs";
import vm from "node:vm";
import * as api from "@fromstan/pokie";
import {auditCascadeGame} from "./AuditCascadeGame.js";

const input = JSON.parse(fs.readFileSync(process.argv[2], "utf-8")) as {recording: api.AuditRoundRecording; blueprint?: api.GameBlueprint; cascadeOptions?: api.CascadeResolverOptions; next?: api.AuditRoundRecording};
let game: api.PokieGame;
if (input.blueprint) {
    const module = {exports: {} as {default?: api.PokieGame}};
    vm.runInNewContext(`(function(require, module, exports) {${api.renderBuiltGameModule(input.blueprint, "1.3.0")}\n})`)(() => api, module, module.exports);
    game = (module.exports.default ?? module.exports) as api.PokieGame;
} else game = auditCascadeGame(() => undefined, input.cascadeOptions);
const replay = new api.ReplayRecorder().replay(game, input.recording);
if (input.next) new api.AuditRoundReplay().replay(game, input.next);
process.stdout.write(JSON.stringify({status: replay.auditStatus, completion: replay.auditCompletion, audit: replay.audit, originalSessionId: replay.originalSessionId, pid: process.pid}));
