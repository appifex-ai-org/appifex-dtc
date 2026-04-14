import type { Runner } from '@appifex/core'
import { join, extname } from 'node:path'

export interface ImageAsset {
  name: string
  filePath: string
  scale?: number
}

/**
 * Write image assets into an xcassets catalog structure.
 * Creates {assetDir}/{name}.imageset/{filename} + Contents.json
 */
export async function writeImageAssets(
  runner: Runner,
  assetDir: string,
  assets: ImageAsset[],
): Promise<string[]> {
  const assetNames: string[] = []

  for (const asset of assets) {
    const ext = extname(asset.filePath) || '.png'
    const filename = `${asset.name}${ext}`
    const imagesetDir = join(assetDir, `${asset.name}.imageset`)

    const contentsJson = JSON.stringify(
      {
        images: [
          {
            filename,
            idiom: 'universal',
            scale: `${asset.scale ?? 2}x`,
          },
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2,
    )

    await runner.writeFile(join(imagesetDir, 'Contents.json'), contentsJson)
    // Use cp for binary image data — runner.readFile returns string which corrupts binary
    await runner.exec('cp', [asset.filePath, join(imagesetDir, filename)])

    assetNames.push(asset.name)
  }

  return assetNames
}
