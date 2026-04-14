# Swift Language & Compiler Error Patterns

## Methodology

1. **Read and Classify** — Read every error message (file, line, message). Group by file — often 5+ errors trace to one root cause.
2. **Investigate** — Read the source file(s). Examine imports, class declarations, protocol conformances.
3. **Fix** — Apply the smallest change that resolves the root cause. Output COMPLETE fixed files.
4. **Verify** — Ensure the fix doesn't introduce new errors.

## Missing Import / Unresolved Identifier

**Error:** `use of unresolved identifier 'X'` or `cannot find 'X' in scope`

**Fix:** Add the missing `import` at the top of the file.

Common missing imports: `Foundation`, `SwiftUI`, `Observation`, `MapKit`, `AVFoundation`, `CoreLocation`, `Charts`, `SwiftData`.

`@Observable` requires `import Observation` in files that do NOT `import SwiftUI`.

## Type Mismatch

**Error:** `cannot convert value of type 'X' to expected argument type 'Y'`

**Fix:** Check the expected type and convert. Common cases:
- `String` → `Int`: use `Int(string) ?? 0`
- `String` where `Binding<String>` expected: use `$variableName`
- `Color` where `ShapeStyle` expected: works as-is (Color conforms to ShapeStyle)

## Missing Member

**Error:** `value of type 'X' has no member 'Y'`

**Fix:** Check for deprecated APIs:
- `.foregroundColor()` → `.foregroundStyle()`
- `.cornerRadius()` → `.clipShape(.rect(cornerRadius:))`

## Missing Return

**Error:** `missing return in a function expected to return 'X'`

**Fix:** Ensure ALL code paths return a value. All `switch` cases must return.

## Exhaustive Switch

**Error:** `switch must be exhaustive`

**Fix:** Add missing `case` branches or a `default` case.

## Protocol Conformance

**Error:** `type 'X' does not conform to protocol 'Y'`

**Fix by protocol:**
- `Encodable`/`Decodable`/`Codable`: Add `CodingKeys` enum, or remove non-conforming stored properties, or add custom `init(from:)` / `encode(to:)`
- `Hashable`: Implement `hash(into:)` and `==`, or ensure all stored properties are `Hashable`
- `Identifiable`: Add `var id: UUID` or appropriate identifier
- `Sendable`: Make `struct` with all `Sendable` properties, or `final class` with `let`-only `Sendable` properties

## Type Shadowing Swift.Task

**Error:** Ambiguous references or unexpected behavior when a model is named `Task`

**Fix:** Rename to `TodoTask`, `AppTask`, `TaskItem`, etc.

## @Published in struct

**Error:** `@Published` property wrapper cannot be used on structs

**Fix:** Convert to `@Observable class` or use `@State` in the view.

## Lazy var on @Observable

**Error:** `lazy` not valid on `@Observable` classes

**Fix:** Use `var` with a default value, or `@ObservationIgnored lazy var`.

## Float Literal Ambiguity

**Error:** Type-checker errors on math expressions with float literals

**Fix:** Add explicit `Float` annotations: `Float.pi`, `Float(0.001)`, `: Float`.

## Optional Unwrap

**Error:** Various optional-related errors

**Fix:** Use `guard let`, `if let`, or `??` — NEVER force-unwrap.

## Duplicate Filenames

**Error:** Redeclaration errors from multiple files with the same name

**Fix:** Rename one of the files. Xcode requires unique filenames across the target.
