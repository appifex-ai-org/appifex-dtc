---
"@appifex/cli": patch
"@appifex/design": patch
"@appifex/spec": patch
"@appifex/mcp-server": patch
---

Generalize the HTML-based design-import path to advertise Claude Design (Anthropic Labs) alongside Google Stitch and Figma Make. Pipeline behavior is unchanged — `dtc run --design <export>.zip` already accepted any HTML+screenshots zip, but the symbols and docs only mentioned Stitch.

Renames (behavior-preserving):

- `extractStitchZip` / `StitchArtifacts` → `extractDesignZip` / `DesignZipArtifacts` (`@appifex/design`)
- `extractSpecFromStitch` / `*Opts` → `extractSpecFromHtmlDesign` / `*Opts` (`@appifex/spec`)
- `.stitch/` extract dir → `.design-import/`
- LLM prompt header `"Stitch Export"` → `"Design Export"`
- `designFile` zod description in `@appifex/mcp-server` lists Stitch / Figma Make / Claude Design

`StitchAdapter`, `FigmaMakeAdapter`, `PencilAdapter`, and `adapter-factory` are untouched.
