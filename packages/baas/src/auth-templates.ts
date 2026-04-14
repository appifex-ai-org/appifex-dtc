import { Eta } from 'eta'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BaasProvider, BaasSchema } from '@appifex/core'
import type { GeneratedFile, TargetPlatform } from './render-templates.js'
import { MOCK_USER } from '@appifex/mock'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function generateAuthTemplates(
  provider: BaasProvider,
  platforms: TargetPlatform[] = ['swift', 'kotlin'],
  schema?: BaasSchema,
): GeneratedFile[] {
  const eta = new Eta({ views: join(__dirname, 'templates', provider) })
  const files: GeneratedFile[] = []

  // AuthManager — mock uses Mock prefix for baas-check exemption (D-07/D-08)
  if (provider === 'mock') {
    if (platforms.includes('swift')) {
      files.push({
        path: 'Sources/Auth/MockAuthManager.swift',
        content: eta.render('./auth-manager.swift.eta', {}),
      })
    }
    if (platforms.includes('kotlin')) {
      files.push({
        path: 'app/src/main/java/auth/MockAuthManager.kt',
        content: eta.render('./auth-manager.kt.eta', {}),
      })
    }
    if (platforms.includes('react')) {
      files.push({
        path: 'src/services/MockAuthManager.tsx',
        content: eta.render('./auth-manager.tsx.eta', { mockUser: MOCK_USER }),
      })
    }
  } else {
    if (platforms.includes('swift')) {
      files.push({
        path: 'Sources/Auth/AuthManager.swift',
        content: eta.render('./auth-manager.swift.eta', {}),
      })
    }
    if (platforms.includes('kotlin')) {
      files.push({
        path: 'app/src/main/java/auth/AuthManager.kt',
        content: eta.render('./auth-manager.kt.eta', {}),
      })
    }
  }

  // Auth screens (Login, Signup, ResetPassword, NewPassword)
  const screens = ['login', 'signup', 'reset-password', 'new-password']
  const swiftNames: Record<string, string> = {
    'login': 'LoginView',
    'signup': 'SignupView',
    'reset-password': 'ResetPasswordView',
    'new-password': 'NewPasswordView',
  }
  const kotlinNames: Record<string, string> = {
    'login': 'LoginScreen',
    'signup': 'SignupScreen',
    'reset-password': 'ResetPasswordScreen',
    'new-password': 'NewPasswordScreen',
  }
  const reactNames: Record<string, string> = {
    'login': 'LoginPage',
    'signup': 'SignupPage',
    'reset-password': 'ResetPasswordPage',
    'new-password': 'NewPasswordPage',
  }

  for (const screen of screens) {
    if (platforms.includes('swift')) {
      files.push({
        path: `Sources/Auth/${swiftNames[screen]}.swift`,
        content: eta.render(`./${screen}-view.swift.eta`, {}),
      })
    }
    if (platforms.includes('kotlin')) {
      files.push({
        path: `app/src/main/java/auth/${kotlinNames[screen]}.kt`,
        content: eta.render(`./${screen}-activity.kt.eta`, {}),
      })
    }
    if (platforms.includes('react')) {
      files.push({
        path: `src/pages/auth/${reactNames[screen]}.tsx`,
        content: eta.render(`./${screen}-page.tsx.eta`, {}),
      })
    }
  }

  // Test templates + preview wrappers — generated only for mock provider (TEST-01, TEST-04)
  if (provider === 'mock') {
    if (platforms.includes('swift')) {
      files.push({
        path: 'Tests/Auth/MockAuthManagerTests.swift',
        content: eta.render('./auth-manager-tests.swift.eta', {}),
      })
      files.push({
        path: 'Sources/Auth/Previews/AuthPreviews.swift',
        content: eta.render('./auth-previews.swift.eta', {}),
      })
    }
    if (platforms.includes('kotlin')) {
      files.push({
        path: 'app/src/test/java/auth/MockAuthManagerTest.kt',
        content: eta.render('./auth-manager-tests.kt.eta', {}),
      })
      files.push({
        path: 'app/src/main/java/auth/previews/AuthPreviews.kt',
        content: eta.render('./auth-previews.kt.eta', {}),
      })
    }
    if (platforms.includes('react')) {
      files.push({
        path: 'src/__tests__/MockAuthManager.test.tsx',
        content: eta.render('./auth-manager-tests.tsx.eta', { mockUser: MOCK_USER }),
      })
      files.push({
        path: 'src/previews/AuthTestHarness.tsx',
        content: eta.render('./auth-test-harness.tsx.eta', {}),
      })
    }
  }

  // ServiceConfiguration — swap-point file generated only for mock provider (D-03, D-04)
  if (provider === 'mock' && schema) {
    if (platforms.includes('swift')) {
      files.push({
        path: 'Sources/ServiceConfiguration.swift',
        content: eta.render('./service-configuration.swift.eta', { schema }),
      })
    }
    if (platforms.includes('kotlin')) {
      files.push({
        path: 'app/src/main/java/ServiceConfiguration.kt',
        content: eta.render('./service-configuration.kt.eta', { schema }),
      })
    }
    if (platforms.includes('react')) {
      files.push({
        path: 'src/services/ServiceConfiguration.tsx',
        content: eta.render('./service-configuration.tsx.eta', { schema, mockUser: MOCK_USER }),
      })
    }
  }

  return files
}
