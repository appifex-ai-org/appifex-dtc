import { Eta } from 'eta'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BaasSchema, BaasProvider } from '@appifex/core'

export interface GeneratedFile {
  path: string
  content: string
}

export type TargetPlatform = 'swift' | 'kotlin' | 'react'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function renderBaasTemplates(
  schema: BaasSchema,
  provider: BaasProvider,
  platforms: TargetPlatform[] = ['swift', 'kotlin'],
): GeneratedFile[] {
  const eta = new Eta({ views: join(__dirname, 'templates', provider) })
  const files: GeneratedFile[] = []

  for (const entity of schema.entities) {
    if (provider === 'mock') {
      // Mock uses Mock prefix for baas-check exemption (D-07/D-08)
      if (platforms.includes('swift')) {
        files.push({
          path: `Sources/Repositories/Mock${entity.name}Repository.swift`,
          content: eta.render('./repository.swift.eta', { entity, schema }),
        })
        files.push({
          path: `Tests/Repositories/Mock${entity.name}RepositoryTests.swift`,
          content: eta.render('./repository-tests.swift.eta', { entity, schema }),
        })
      }
      if (platforms.includes('kotlin')) {
        files.push({
          path: `app/src/main/java/repositories/Mock${entity.name}Repository.kt`,
          content: eta.render('./repository.kt.eta', { entity, schema }),
        })
        files.push({
          path: `app/src/test/java/repositories/Mock${entity.name}RepositoryTest.kt`,
          content: eta.render('./repository-tests.kt.eta', { entity, schema }),
        })
      }
      if (platforms.includes('react')) {
        files.push({
          path: `src/services/Mock${entity.name}Repository.tsx`,
          content: eta.render('./repository.tsx.eta', { entity, schema }),
        })
        files.push({
          path: `src/__tests__/Mock${entity.name}Repository.test.tsx`,
          content: eta.render('./repository-tests.tsx.eta', { entity, schema }),
        })
      }
    } else {
      if (platforms.includes('swift')) {
        files.push({
          path: `Sources/Repositories/${entity.name}Repository.swift`,
          content: eta.render('./repository.swift.eta', { entity, schema }),
        })
      }
      if (platforms.includes('kotlin')) {
        files.push({
          path: `app/src/main/java/repositories/${entity.name}Repository.kt`,
          content: eta.render('./repository.kt.eta', { entity, schema }),
        })
      }
    }
  }

  // Security rules — single file for all entities (skip for mock — no cloud backend)
  if (provider !== 'mock') {
    const rulesTemplate = provider === 'firebase' ? './security.rules.eta' : './rls-policies.sql.eta'
    const rulesPath = provider === 'firebase' ? 'firestore.rules' : 'supabase/rls-policies.sql'
    files.push({ path: rulesPath, content: eta.render(rulesTemplate, { schema }) })
  }

  return files
}
