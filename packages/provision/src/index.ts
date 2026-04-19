// Phase 5 Plan 06 (TF-01 D-03): AscClient + asc-client.ts deleted. Replaced by
// the free-function ASC REST surface in asc-rest.ts + the orchestrator in
// testflight-upload-phase.ts. No runtime shell-out to the community `asc` CLI
// remains anywhere.
export { PlayConsoleClient } from './play-console-client.js'
export type {
  PlayConsoleCredentials,
  PlayConsoleResult,
  SubmitToTrackOpts,
} from './play-console-client.js'
// Phase 5 (TF-01, TF-04): ASC REST client — free-function replacement for AscClient.
export * from './asc-rest.js'
// Phase 5 Plan 05 (TF-01, TF-04): altool subprocess driver + polling loop + phase orchestrator.
export * from './altool.js'
export * from './testflight-polling.js'
export { runTestFlightUploadPhase } from './testflight-upload-phase.js'
export type {
  TestFlightUploadPhaseOpts,
  TestFlightUploadPhaseResult,
} from './testflight-upload-phase.js'
