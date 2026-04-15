import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'packages/__tests__/**/*.test.ts',
      'cli/__tests__/**/*.test.ts',
      '__tests__/**/*.test.ts',
    ],
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@appifex/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@appifex/runner': resolve(__dirname, 'packages/runner/src/index.ts'),
      '@appifex/design': resolve(__dirname, 'packages/design/src/index.ts'),
      '@appifex/spec': resolve(__dirname, 'packages/spec/src/index.ts'),
      '@appifex/test-gen': resolve(__dirname, 'packages/test-gen/src/index.ts'),
      '@appifex/codegen': resolve(__dirname, 'packages/codegen/src/index.ts'),
      '@appifex/build': resolve(__dirname, 'packages/build/src/index.ts'),
      '@appifex/validate': resolve(__dirname, 'packages/validate/src/index.ts'),
      '@appifex/fix': resolve(__dirname, 'packages/fix/src/index.ts'),
      '@appifex/provision': resolve(__dirname, 'packages/provision/src/index.ts'),
      '@appifex/report': resolve(__dirname, 'packages/report/src/index.ts'),
      '@appifex/deliver': resolve(__dirname, 'packages/deliver/src/index.ts'),
      '@appifex/agent': resolve(__dirname, 'packages/agent/src/index.ts'),
      '@appifex/analysis': resolve(__dirname, 'packages/analysis/src/index.ts'),
      '@appifex/baas': resolve(__dirname, 'packages/baas/src/index.ts'),
      '@appifex/baas-check': resolve(__dirname, 'packages/baas-check/src/index.ts'),
      '@appifex/mock-check': resolve(__dirname, 'packages/mock-check/src/index.ts'),
      '@appifex/mock': resolve(__dirname, 'packages/mock/src/index.ts'),
      '@appifex/mcp-server': resolve(__dirname, 'packages/mcp-server/src/index.ts'),
      '@appifex/cli': resolve(__dirname, 'cli/src/pipeline.ts'),
    },
  },
})
