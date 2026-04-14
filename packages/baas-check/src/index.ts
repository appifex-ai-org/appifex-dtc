export { checkBaasIntegration } from './baas-integration.js'
export { stripComments } from './comment-strip.js'
export * as swiftFirebase from './patterns/swift-firebase.js'
export * as kotlinFirebase from './patterns/kotlin-firebase.js'
export type {
  BaasViolationType,
  BaasIntegrationViolation,
  BaasIntegrationResult,
  ParityViolation,
  BaasParityResult,
} from '@appifex/core'
export { checkBaasParity } from './baas-parity.js'
