import type { BackendContext, Platform } from './types.js'

/** Format a BackendContext into a prompt section for the agent */
export function buildBackendPromptSection(ctx: BackendContext, platform: Platform = 'swiftui'): string {
  const lines: string[] = []
  const isSwift = platform === 'swiftui'
  const isKotlin = platform === 'kotlin-compose'
  const isReact = platform === 'react'

  lines.push(`## Backend API Integration`)
  lines.push('')
  lines.push(`This app connects to a backend API. You MUST implement a networking layer.`)
  lines.push('')
  lines.push(`**API Base URL:** \`${ctx.apiBaseUrl}\``)

  // Auth
  if (ctx.auth) {
    lines.push('')
    lines.push(`**Authentication:** ${ctx.auth.type}`)
    if (ctx.auth.description) lines.push(`> ${ctx.auth.description}`)
  }

  // Endpoints
  if (ctx.endpoints.length > 0) {
    lines.push('')
    lines.push(`### Endpoints`)
    lines.push('')
    for (const ep of ctx.endpoints) {
      const desc = ep.description ? ` — ${ep.description}` : ''
      lines.push(`- \`${ep.method} ${ep.path}\`${desc}`)
      if (ep.requestBody) lines.push(`  - Request: \`${ep.requestBody}\``)
      if (ep.responseBody) lines.push(`  - Response: \`${ep.responseBody}\``)
    }
  }

  // Models
  if (ctx.models && Object.keys(ctx.models).length > 0) {
    const lang = isSwift ? 'swift' : isKotlin ? 'kotlin' : 'typescript'
    const codeLabel = isSwift ? 'Swift' : isKotlin ? 'Kotlin' : 'TypeScript'
    lines.push('')
    lines.push(`### Backend Models (match these in your ${codeLabel} code)`)
    lines.push('')
    for (const [name, definition] of Object.entries(ctx.models)) {
      lines.push(`**${name}:**`)
      lines.push(`\`\`\`${lang}`)
      lines.push(definition)
      lines.push('```')
      lines.push('')
    }
  }

  // Notes
  if (ctx.notes) {
    lines.push('')
    lines.push(`### Additional Notes`)
    lines.push(ctx.notes)
  }

  // Platform-specific networking instructions
  lines.push('')
  lines.push(`### Networking Requirements`)
  lines.push('')

  if (isSwift) {
    lines.push(`Create a \`Sources/Services/APIClient.swift\` that:`)
    lines.push(`1. Uses \`URLSession.shared\` with async/await`)
    lines.push(`2. Sets the base URL to \`${ctx.apiBaseUrl}\``)
    lines.push(`3. All models must conform to \`Codable\` for JSON serialization`)
    lines.push(`4. Use \`JSONDecoder\` with \`.convertFromSnakeCase\` key decoding strategy`)
    lines.push(`5. Handle errors gracefully — show user-friendly error states in the UI`)
    if (ctx.auth?.type === 'bearer') {
      lines.push(`6. Store the auth token securely and attach it as \`Authorization: Bearer <token>\` on every request`)
    }
  } else if (isKotlin) {
    lines.push(`Create a \`app/src/main/java/com/dtc/app/data/api/ApiClient.kt\` that:`)
    lines.push(`1. Uses Retrofit + OkHttp with Kotlin coroutines (suspend functions)`)
    lines.push(`2. Sets the base URL to \`${ctx.apiBaseUrl}\``)
    lines.push(`3. Define Kotlin data classes with \`@SerializedName\` annotations matching the backend models`)
    lines.push(`4. Use Gson or Moshi converter for JSON serialization`)
    lines.push(`5. Handle errors gracefully — use sealed class \`Result<T>\` for success/error states`)
    if (ctx.auth?.type === 'bearer') {
      lines.push(`6. Use an OkHttp Interceptor to attach \`Authorization: Bearer <token>\` on every request`)
    }
  } else if (isReact) {
    lines.push(`Create a \`src/services/apiClient.ts\` that:`)
    lines.push(`1. Uses \`fetch\` with async/await`)
    lines.push(`2. Sets the base URL to \`${ctx.apiBaseUrl}\``)
    lines.push(`3. Define TypeScript interfaces matching the backend models`)
    lines.push(`4. Use \`JSON.parse\` / \`JSON.stringify\` for serialization`)
    lines.push(`5. Handle errors gracefully — use try/catch and return typed error states`)
    if (ctx.auth?.type === 'bearer') {
      lines.push(`6. Store the auth token and attach it as \`Authorization: Bearer <token>\` on every request`)
    }
  } else {
    const _exhaustive: never = platform
    throw new Error(`Unsupported platform: ${_exhaustive}`)
  }

  return lines.join('\n')
}
