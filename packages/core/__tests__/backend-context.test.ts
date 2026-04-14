import { describe, it, expect } from 'vitest'
import { buildBackendPromptSection } from '../src/backend-context.js'
import type { BackendContext } from '../src/types.js'

function makeBackendContext(overrides: Partial<BackendContext> = {}): BackendContext {
  return {
    apiBaseUrl: 'https://api.petapp.com',
    endpoints: [
      { method: 'GET', path: '/api/pets', description: 'List all pets' },
      { method: 'GET', path: '/api/pets/{id}', description: 'Get pet by ID' },
      { method: 'POST', path: '/api/pets', description: 'Create a pet' },
      { method: 'POST', path: '/api/auth/login', description: 'Login' },
    ],
    models: {
      'Pet': 'struct Pet: Codable, Identifiable {\n  let id: UUID\n  var name: String\n  var breed: String\n  var age: Int\n}',
      'User': 'struct User: Codable, Identifiable {\n  let id: UUID\n  var email: String\n  var displayName: String\n}',
    },
    auth: { type: 'bearer', description: 'JWT token in Authorization header' },
    ...overrides,
  }
}

describe('buildBackendPromptSection', () => {
  it('includes the API base URL', () => {
    const section = buildBackendPromptSection(makeBackendContext())

    expect(section).toContain('https://api.petapp.com')
  })

  it('lists all endpoints with methods and paths', () => {
    const section = buildBackendPromptSection(makeBackendContext())

    expect(section).toContain('GET /api/pets')
    expect(section).toContain('POST /api/pets')
    expect(section).toContain('POST /api/auth/login')
    expect(section).toContain('List all pets')
  })

  it('includes model definitions', () => {
    const section = buildBackendPromptSection(makeBackendContext())

    expect(section).toContain('Pet')
    expect(section).toContain('struct Pet: Codable')
    expect(section).toContain('User')
  })

  it('includes auth configuration', () => {
    const section = buildBackendPromptSection(makeBackendContext())

    expect(section).toContain('bearer')
    expect(section).toContain('JWT token')
  })

  it('includes networking instructions for SwiftUI', () => {
    const section = buildBackendPromptSection(makeBackendContext())

    expect(section).toContain('URLSession')
    expect(section).toContain('async')
  })

  it('works without auth', () => {
    const section = buildBackendPromptSection(makeBackendContext({ auth: undefined }))

    expect(section).toContain('https://api.petapp.com')
    expect(section).toContain('GET /api/pets')
    expect(section).not.toContain('bearer')
  })

  it('works without models', () => {
    const section = buildBackendPromptSection(makeBackendContext({ models: undefined }))

    expect(section).toContain('GET /api/pets')
    // Should still have networking instructions
    expect(section).toContain('URLSession')
  })

  it('works with minimal context (URL only)', () => {
    const section = buildBackendPromptSection({
      apiBaseUrl: 'http://localhost:8000',
      endpoints: [],
    })

    expect(section).toContain('http://localhost:8000')
    expect(section).toContain('URLSession')
  })

  it('uses Kotlin/Retrofit instructions for kotlin-compose platform', () => {
    const section = buildBackendPromptSection(makeBackendContext(), 'kotlin-compose')

    expect(section).toContain('Kotlin')
    expect(section).toContain('Retrofit')
    expect(section).not.toContain('URLSession')
    expect(section).not.toContain('Sources/Services/APIClient.swift')
  })

  it('uses Swift/URLSession instructions for swiftui platform', () => {
    const section = buildBackendPromptSection(makeBackendContext(), 'swiftui')

    expect(section).toContain('Sources/Services/APIClient.swift')
    expect(section).toContain('URLSession')
    expect(section).toContain('Codable')
    expect(section).not.toContain('src/services/api.ts')
  })

  it('shows models in Kotlin code block for kotlin-compose', () => {
    const section = buildBackendPromptSection(makeBackendContext(), 'kotlin-compose')

    expect(section).toContain('```kotlin')
    expect(section).not.toContain('```swift')
  })
})
