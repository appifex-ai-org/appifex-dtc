# SwiftData & XcodeGen Error Patterns

## SwiftData Compile-Time Errors

**`@Model can only be applied to a class`** — Change `struct` to `class`; add explicit `init`.

**`Missing modelContainer`** — Add `.modelContainer(for: [MyModel.self])` to root `WindowGroup`.

**`does not conform to PersistentModel`** — Add `@Model`; use only supported property types.

**`#Predicate type mismatch`** — Match comparison value types exactly.

## SwiftData Runtime Crash Patterns (compile fine but crash)

- `isEmpty == false` in `#Predicate` → use `!isEmpty`
- Computed properties in `#Predicate` → use only stored `@Model` properties
- `@Transient` in `#Predicate` → not queryable, remove from predicate
- `lowercased().contains()` → use `localizedStandardContains()`
- Property named `description` on `@Model` → rename to `desc`, `summary`, etc.
- Missing `deleteRule:` on non-optional relationship → add `@Relationship(deleteRule: .cascade, inverse:)`
- `@Relationship` on both sides → put on ONE side only
- `willSet`/`didSet` silently ignored → move side effects to method

## XcodeGen / project.yml Errors

### Missing Source Files (Linker Errors)

**Error:** `undefined symbols for architecture` or linker errors

**Fix:** Ensure all `.swift` files are in the `sources:` path in `project.yml`:
```yaml
targets:
  App:
    sources:
      - path: Sources
        type: group
```

### Missing SPM Dependency

**Error:** `no such module 'X'`

**Fix:** Add the package to `project.yml`:
```yaml
packages:
  PackageName:
    url: https://github.com/org/Package
    from: "1.0.0"

targets:
  App:
    dependencies:
      - package: PackageName
```

### Swift Charts

**Error:** `Cannot find 'Chart' in scope`

**Fix:** Add `import Charts`. Verify deployment target is iOS 16+.

### Metal Shader Errors

- Missing `#include <metal_stdlib>` and `using namespace metal;`
- Buffer binding mismatch: `[[buffer(N)]]` must match `setBuffer(..., index: N)`
- Type alignment: `simd_float4` (Swift) = `float4` (Metal)
- `.metal` files must be in the main target sources
