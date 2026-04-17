export { AscClient } from './asc-client.js'
export type { AscCredentials, AscResult, AppInfo, SubmitTestFlightOpts } from './asc-client.js'
export { PlayConsoleClient } from './play-console-client.js'
export type {
  PlayConsoleCredentials,
  PlayConsoleResult,
  SubmitToTrackOpts,
} from './play-console-client.js'
// Phase 5 (TF-01, TF-04): ASC REST client — free-function replacement for AscClient.
// Plan 06 will delete asc-client.ts; for now both coexist.
export * from './asc-rest.js'
// Phase 5 Plan 05 (TF-01, TF-04): altool subprocess driver + polling loop + phase orchestrator.
export * from './altool.js'
export * from './testflight-polling.js'
export { runTestFlightUploadPhase } from './testflight-upload-phase.js'
export type {
  TestFlightUploadPhaseOpts,
  TestFlightUploadPhaseResult,
} from './testflight-upload-phase.js'
