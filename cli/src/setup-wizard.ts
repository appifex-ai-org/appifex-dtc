// Phase 03 Plan 03 (SETUP-01, D-09): setup-wizard.ts is now a thin re-export of the sectioned wizard.
// Original 725-line monolith split into cli/src/setup/<section>.ts modules.
export { setupWizard, runSection, SECTION_ORDER, SECTIONS } from './setup/index.js'
export type { SectionName, SetupWizardOpts } from './setup/index.js'
