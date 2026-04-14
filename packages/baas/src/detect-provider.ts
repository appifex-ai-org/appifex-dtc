import type { BaasProvider, Runner } from '@appifex/core'

// ── Detection (FOUND-01, D-01, D-02) ────────────────────────────────────────

/**
 * Probe the project directory for BaaS config files.
 * Firebase first (D-02): plist (iOS) or google-services.json (Android).
 * Supabase second: checks .env for a real (non-placeholder) SUPABASE_URL.
 * First match wins. Returns null if no provider detected — caller falls through to wizard.
 */
export async function detectBaasProvider(
  runner: Runner,
  projectDir: string,
): Promise<BaasProvider | null> {
  // Firebase first (D-02): plist (iOS) or google-services.json (Android)
  const plistPath = `${projectDir}/GoogleService-Info.plist`
  const jsonPath = `${projectDir}/google-services.json`
  const jsonAndroidPath = `${projectDir}/android/app/google-services.json`
  if (
    (await runner.exists(plistPath)) ||
    (await runner.exists(jsonPath)) ||
    (await runner.exists(jsonAndroidPath))
  ) {
    return 'firebase'
  }

  // Supabase second: check .env for real (non-placeholder) SUPABASE_URL
  const envPath = `${projectDir}/.env`
  if (await runner.exists(envPath)) {
    try {
      const content = await runner.readFile(envPath)
      if (hasRealSupabaseConfig(content)) {
        return 'supabase'
      }
    } catch {
      // Malformed .env — return null, do not throw
      return null
    }
  }

  return null
}

/**
 * Check if .env content contains real (non-placeholder) Supabase config.
 * Rejects placeholder values from generateConfigStubs('supabase').
 */
function hasRealSupabaseConfig(content: string): boolean {
  const lines = content.split('\n')
  let hasUrl = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key === 'SUPABASE_URL' && value.length > 0) {
      // Reject known placeholder from config-stubs.ts
      if (value === 'https://placeholder.supabase.co') continue
      hasUrl = true
    }
  }
  return hasUrl
}

// ── Config Parsing (PROV-01) ─────────────────────────────────────────────────

export interface ParsedFirebaseConfig {
  apiKey: string
  projectId: string
  bundleId: string
  googleAppId: string
  gcmSenderId: string
  storageBucket: string
}

/**
 * Parse Firebase config from GoogleService-Info.plist or google-services.json.
 * Returns null on parse failure (never throws).
 */
export async function parseFirebaseConfig(
  runner: Runner,
  projectDir: string,
): Promise<ParsedFirebaseConfig | null> {
  // Try plist first (iOS), then JSON (Android root), then JSON (Android standard path)
  const plistPath = `${projectDir}/GoogleService-Info.plist`
  if (await runner.exists(plistPath)) {
    try {
      const content = await runner.readFile(plistPath)
      return parsePlist(content)
    } catch {
      return null
    }
  }

  for (const jsonPath of [
    `${projectDir}/google-services.json`,
    `${projectDir}/android/app/google-services.json`,
  ]) {
    if (await runner.exists(jsonPath)) {
      try {
        const content = await runner.readFile(jsonPath)
        return parseGoogleServicesJson(content)
      } catch {
        return null
      }
    }
  }

  return null
}

/**
 * Extract Firebase config keys from a plist string using regex.
 * No XML library needed — the plist has a fixed structure with 6 known keys.
 */
function parsePlist(content: string): ParsedFirebaseConfig | null {
  const extract = (key: string): string | null => {
    const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`)
    const m = content.match(re)
    return m?.[1] ?? null
  }

  const apiKey = extract('API_KEY')
  const projectId = extract('PROJECT_ID')
  const bundleId = extract('BUNDLE_ID')
  const googleAppId = extract('GOOGLE_APP_ID')
  const gcmSenderId = extract('GCM_SENDER_ID')
  const storageBucket = extract('STORAGE_BUCKET')

  if (!apiKey || !projectId || !bundleId || !googleAppId || !gcmSenderId || !storageBucket) {
    return null // Incomplete plist — treat as unparseable
  }

  // Reject placeholder values from config-stubs.ts
  if (apiKey.startsWith('REPLACE_WITH_')) return null

  return { apiKey, projectId, bundleId, googleAppId, gcmSenderId, storageBucket }
}

/**
 * Extract Firebase config from google-services.json (Android format).
 */
function parseGoogleServicesJson(content: string): ParsedFirebaseConfig | null {
  try {
    const json = JSON.parse(content)
    const projectInfo = json?.project_info
    const client = json?.client?.[0]
    const apiKey = client?.api_key?.[0]?.current_key
    const projectId = projectInfo?.project_id
    const storageBucket = projectInfo?.storage_bucket
    const googleAppId = client?.client_info?.mobilesdk_app_id
    const gcmSenderId = projectInfo?.project_number
    const bundleId = client?.client_info?.android_client_info?.package_name ?? ''

    if (!apiKey || !projectId || !googleAppId || !gcmSenderId || !storageBucket) {
      return null
    }

    return { apiKey, projectId, bundleId, googleAppId, gcmSenderId, storageBucket }
  } catch {
    return null
  }
}

// ── Config Parsing (PROV-02) ─────────────────────────────────────────────────

export interface ParsedSupabaseConfig {
  url: string
  anonKey: string
}

/**
 * Parse Supabase config from .env file. Extracts SUPABASE_URL and SUPABASE_ANON_KEY.
 * Returns null if either key is missing, placeholder, or file is malformed.
 */
export async function parseSupabaseConfig(
  runner: Runner,
  projectDir: string,
): Promise<ParsedSupabaseConfig | null> {
  const envPath = `${projectDir}/.env`
  if (!(await runner.exists(envPath))) return null

  try {
    const content = await runner.readFile(envPath)
    return parseEnvForSupabase(content)
  } catch {
    return null
  }
}

/**
 * Parse KEY=VALUE lines from .env content for Supabase config.
 * Ignores comments, blank lines, and shell syntax. Only reads expected keys.
 */
function parseEnvForSupabase(content: string): ParsedSupabaseConfig | null {
  let url: string | undefined
  let anonKey: string | undefined

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()

    if (key === 'SUPABASE_URL') url = value
    if (key === 'SUPABASE_ANON_KEY') anonKey = value
  }

  if (!url || !anonKey) return null
  // Reject placeholders from config-stubs.ts
  if (url === 'https://placeholder.supabase.co') return null
  if (anonKey === 'placeholder-anon-key') return null

  return { url, anonKey }
}
