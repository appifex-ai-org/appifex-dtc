// Phase 5 (TF-02 D-13): Shared js-yaml parse/mutate/serialize helpers for XcodeGen project.yml.
// Extracted from packages/build/src/swift.ts:128-168 (Phase 4 FIRE-02 D-03 inline pattern).
// Used by Phase 4 (Firebase REVERSED_CLIENT_ID URL scheme) and Phase 5 (release hygiene
// + build/marketing version injection). CORRECTS D-10: Info.plist keys go via setInfoProperty
// (info.properties path), xcconfig-style build settings via setBuildSetting (settings path).
// See 05-RESEARCH.md Pitfall 1, Pitfall 2, Pitfall 11.

import yaml from 'js-yaml'
import type { Runner } from '@appifex/core'

export interface ProjectYml {
  name: string
  targets: Record<string, XcodeGenTarget>
  packages?: Record<string, unknown>
  [key: string]: unknown
}

interface XcodeGenTarget {
  type?: string
  platform?: string
  sources?: unknown
  info?: { path?: string; properties?: Record<string, unknown> }
  settings?: Record<string, unknown> | { base?: Record<string, unknown> }
  dependencies?: unknown[]
  [key: string]: unknown
}

/** Read a project.yml through the Runner port and parse it with js-yaml DEFAULT_SCHEMA. */
export async function readProjectYml(runner: Runner, ymlPath: string): Promise<ProjectYml> {
  const raw = await runner.readFile(ymlPath)
  // DEFAULT_SCHEMA (YAML 1.2) — does NOT coerce YES/NO to booleans (Pitfall 2).
  return yaml.load(raw) as ProjectYml
}

/** Serialize a ProjectYml doc through the Runner port with XcodeGen-compatible options. */
export async function writeProjectYml(
  runner: Runner,
  ymlPath: string,
  doc: ProjectYml,
): Promise<void> {
  // lineWidth: -1 → no line folding (long SPM URLs); noRefs: true → no YAML anchors;
  // quotingType: '"' → matches XcodeGen output style.
  const out = yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' })
  await runner.writeFile(ymlPath, out)
}

/** Set an xcconfig-style build setting on a target. Handles flat or { base: {...} } shapes. */
export function setBuildSetting(
  doc: ProjectYml,
  targetName: string,
  key: string,
  value: unknown,
): void {
  const target = doc.targets[targetName]
  if (!target) throw new Error(`target ${targetName} not found in project.yml`)
  if (!target.settings) target.settings = {}
  const settings = target.settings as Record<string, unknown>
  if ('base' in settings && typeof settings['base'] === 'object' && settings['base'] !== null) {
    ;(settings['base'] as Record<string, unknown>)[key] = value
  } else {
    settings[key] = value
  }
}

/** Set an Info.plist property on a target. Creates info.properties if missing. */
export function setInfoProperty(
  doc: ProjectYml,
  targetName: string,
  key: string,
  value: unknown,
): void {
  const target = doc.targets[targetName]
  if (!target) throw new Error(`target ${targetName} not found in project.yml`)
  if (!target.info) target.info = { properties: {} }
  if (!target.info.properties) target.info.properties = {}
  target.info.properties[key] = value
}

/** Return the first non-test target name. Throws if none found. */
export function findAppTargetName(doc: ProjectYml): string {
  const name = Object.keys(doc.targets).find((k) => !k.endsWith('Tests'))
  if (!name) throw new Error('No app target found in project.yml')
  return name
}
