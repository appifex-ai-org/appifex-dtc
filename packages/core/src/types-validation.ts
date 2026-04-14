import type { Platform } from './types-design.js'

// ── BaaS (Backend-as-a-Service) ──
export type BaasProvider = 'firebase' | 'supabase' | 'mock'
export type BaasRecommendationTier = 'appropriate' | 'caveats' | 'custom_backend'

export interface BaasRecommendation {
  tier: BaasRecommendationTier
  reason: string
}

export type BaasFieldType = 'string' | 'number' | 'boolean' | 'date' | 'reference' | 'array'

export interface BaasField {
  name: string
  type: BaasFieldType
  required: boolean
}

export interface BaasRelationship {
  target: string
  type: 'belongs_to' | 'has_many'
}

export interface BaasEntity {
  name: string
  fields: BaasField[]
  relationships: BaasRelationship[]
}

export interface BaasSchema {
  entities: BaasEntity[]
}

export interface AuthConfig {
  urlScheme: string        // e.g., 'myapp' — used for deep link handling
  firebaseProjectId?: string  // For Firebase Hosting Universal Links domain
}

export interface BaasContext {
  provider: BaasProvider
  recommendation: BaasRecommendation
  schema?: BaasSchema
  securityRules?: string
  authConfig?: AuthConfig
  wiringMetadata?: unknown
}

export interface BaasConfig {
  provider?: BaasProvider
}

// ── BaaS Integration Detection (Phase 25) ──
export type BaasViolationType =
  | 'missing_import'
  | 'facade_auth'
  | 'missing_sdk_call'
  | 'template_overwritten'

export interface BaasIntegrationViolation {
  file: string          // relative path from projectDir
  platform: Platform    // 'swiftui' | 'kotlin-compose'
  type: BaasViolationType
  matched?: string      // the facade line found (facade_auth violations)
  expected: string      // human-readable description of what should be there
  line?: number         // approximate line number (optional)
  remediation: string   // human-readable fix hint
}

export interface BaasIntegrationResult {
  allPassed: boolean
  violations: BaasIntegrationViolation[]
  filesScanned: number
  duration: number      // ms
  platformsScanned?: Platform[]  // Phase 26 — optional for backward compat
}

// ── BaaS Parity Detection (Phase 26) ──
export interface ParityViolation {
  passingPlatform: Platform
  failingPlatform: Platform
  failingViolationTypes: BaasViolationType[]
  remediation: string
}

export interface BaasParityResult {
  allPassed: boolean
  violations: ParityViolation[]
  platformsCompared: Platform[]
}

// ── Mock Layer Validation (Phase 38) ──
export type MockViolationType = 'MISSING_MOCK' | 'MISSING_METHOD' | 'SIGNATURE_MISMATCH'

export interface MockLayerViolation {
  file: string           // relative path from projectDir
  platform: Platform     // 'swiftui' | 'kotlin-compose' | 'react'
  type: MockViolationType
  entity?: string        // entity name (for MISSING_MOCK of repositories, MISSING_METHOD, SIGNATURE_MISMATCH)
  method?: string        // method name (MISSING_METHOD, SIGNATURE_MISMATCH)
  expected?: string      // interface declaration (SIGNATURE_MISMATCH)
  actual?: string        // mock declaration (SIGNATURE_MISMATCH)
  remediation: string
}

export interface MockCheckResult {
  allPassed: boolean
  violations: MockLayerViolation[]
  filesScanned: number
  duration: number
  platformsScanned: Platform[]
}

export interface MockParityViolation {
  passingPlatform: Platform
  failingPlatform: Platform
  failingViolationTypes: MockViolationType[]
  remediation: string
}

export interface MockParityResult {
  allPassed: boolean
  violations: MockParityViolation[]
  platformsCompared: Platform[]
}

export interface MockCheckContext {
  // Optional fields populate the mock validation contract. When present, the
  // schema enables future entity-aware checks; provider documents the source.
  schema?: BaasSchema
  provider?: BaasProvider
}
