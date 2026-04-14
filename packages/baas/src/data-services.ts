import { Eta } from 'eta'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BaasSchema, BaasProvider } from '@appifex/core'
import type { GeneratedFile, TargetPlatform } from './render-templates.js'
import { MOCK_USER } from '@appifex/mock'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function generateDataServices(
  schema: BaasSchema,
  provider: BaasProvider,
  platforms: TargetPlatform[] = ['swift'],
): GeneratedFile[] {
  const eta = new Eta({ views: join(__dirname, 'templates', provider) })
  const files: GeneratedFile[] = []

  for (const entity of schema.entities) {
    if (platforms.includes('swift')) {
      files.push({
        path: `Sources/Services/${entity.name}DataService.swift`,
        content: eta.render('./data-service.swift.eta', { entity, schema }),
      })
    }
  }

  // React MockDataService is schema-level (aggregates all repositories into one DataContext)
  if (platforms.includes('react')) {
    files.push({
      path: 'src/services/MockDataService.tsx',
      content: eta.render('./data-service.tsx.eta', { schema, mockUser: MOCK_USER }),
    })
  }

  return files
}
