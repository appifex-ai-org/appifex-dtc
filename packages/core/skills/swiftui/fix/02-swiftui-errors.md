# SwiftUI Error Patterns

## Type-Check Timeout

**Error:** `the compiler is unable to type-check this expression in reasonable time`

**Fix:** Break up the `body` — extract sub-views into separate `struct` types.

## Type '()' cannot conform to 'View'

**Error:** `Type '()' cannot conform to 'View'`

**Fix:** Remove `print()` from body. Use `.onAppear { print(...) }` instead.

## Cannot convert 'some View' to closure result type

**Fix:** Add `@ViewBuilder` attribute to the function. Remove explicit `return` keywords.

## Cannot find '$X' in scope

**Error:** Binding syntax `$variable` not found

**Fix:**
- For `@State`: ensure it's declared as `@State private var x = ...`
- For `@Observable` environment: wrap with `@Bindable`:
```swift
@Environment(MyModel.self) var model
var body: some View {
    @Bindable var model = model
    TextField("Name", text: $model.name)
}
```

## Passing String where Binding<String> expected

**Fix:** Use `$` prefix: `TextField("Name", text: $name)` not `TextField("Name", text: name)`

## Deprecated API Replacements

| Deprecated | Replacement |
|-----------|-------------|
| `NavigationView` | `NavigationStack` |
| `ObservableObject` + `@Published` | `@Observable` |
| `foregroundColor()` | `foregroundStyle()` |
| `cornerRadius()` | `clipShape(.rect(cornerRadius:))` |
| `AnyView` | `@ViewBuilder` |

## ViewBuilder Issues

- Remove explicit `return` keywords
- Every `if` branch must produce a `View` — add `EmptyView()` for empty branches
- No `print()`, `var` declarations, or function definitions inside `body`
- Functions returning conditional views MUST use `@ViewBuilder`

## Local var in @ViewBuilder closure

**Fix:** Move computation before the closure, assign to a `let` constant.
