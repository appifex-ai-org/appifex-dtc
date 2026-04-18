export { extractSpec } from './extract.js'
export { extractSpecFromPen, extractSpecFromPenObject } from './pen-extractor.js'
export { extractSpecFromMcp } from './mcp-extractor.js'
export {
  translateSpec,
  inferAppImageStyle,
  generateSwiftModifiers,
  generateComposeModifiers,
} from './translate.js'
export { toSfSymbol, ICON_TO_SF_SYMBOL } from './icon-mapping.js'
export { generateSpecFromPrompt } from './generate-spec.js'
export type { GenerateSpecOpts, CreateMessageFn } from './generate-spec.js'
export { parseDesignMd, extractSpecFromHtmlDesign } from './html-design-extractor.js'
export type { ExtractSpecFromHtmlDesignOpts } from './html-design-extractor.js'
export { parseTailwindColors, extractSpecFromFigmaMake } from './figma-make-extractor.js'
export type { ExtractSpecFromFigmaMakeOpts } from './figma-make-extractor.js'
