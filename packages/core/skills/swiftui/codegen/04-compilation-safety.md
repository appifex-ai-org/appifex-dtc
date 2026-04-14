# Compilation Safety Rules

## Mandatory Rules

1. Every `switch` must be exhaustive — add all cases or a `default`
2. Every computed property must return in ALL branches
3. Never guess API signatures — use simpler alternatives if unsure
4. Prefer `String` bindings over numeric `FormatStyle` bindings when uncertain
5. Always safely unwrap optionals — never force-unwrap (`!`)
6. Always annotate `Float`/`CGFloat` types explicitly — use `Float.pi` not `.pi`
7. One type per Swift file — each `struct`, `class`, or `enum` gets its own `.swift` file

## ViewBuilder Rules

- Functions returning conditional views MUST use `@ViewBuilder`
- No `print()`, `var` declarations, or function definitions inside `body`
- Every `if` branch must produce a `View` — add `EmptyView()` for empty branches
- Remove explicit `return` keywords — ViewBuilder needs implicit returns

## Avoid Type-Check Timeouts

- Extract sub-views when `body` exceeds ~20 lines
- Never use `Text("A") + Text("B").bold()` concatenation — use `HStack`
- Replace complex inline ternaries with `@ViewBuilder` helpers
- Break long arithmetic into `let` variables

## Protocol Conformance Access Control

Methods implementing a protocol MUST have the same access level as the conforming type.
For `UIViewRepresentable`: NEVER mark required methods as `private`.

```swift
// CORRECT
struct CameraPreview: UIViewRepresentable {
    func makeUIView(context: Context) -> PreviewContainerView { ... }
}

// WRONG — private type used as return type of internal method
private final class PreviewContainerView: UIView { ... }  // build error
```

## Swift Concurrency Safety

- `@MainActor` on ALL ViewModels and `@Observable` classes called from Views
- All async work via `async/await` — `.task { }` modifier preferred over `Task { }` in `onAppear`
- ALL types passed across actor boundaries must be `Sendable`
- Global/static mutable state must be isolated (`@MainActor`) or an `actor`

### Delegate Protocol Conformance

```swift
// WRONG — "conformance crosses into main actor-isolated code"
class GameScene: SKScene, SKPhysicsContactDelegate { ... }

// CORRECT — use @preconcurrency extension
class GameScene: SKScene { ... }
extension GameScene: @preconcurrency SKPhysicsContactDelegate {
    func didBegin(_ contact: SKPhysicsContact) { ... }
}
```

## Common Codable/Hashable Pitfalls

- `Codable` with `UUID` default: add explicit `CodingKeys` or custom `init(from:)`
- Type named `Task`: shadows `Swift.Task` — rename to `TodoTask`, `AppTask`, etc.
- `@Published` in struct: use `@Observable class` or `@State` in view
- `Identifiable` requires `id` property — use `UUID` or a stable identifier
- `Hashable` conformance: if model has non-Hashable properties, implement `hash(into:)` manually

## Performance Rules

- No object creation in `body` — formatters, date formatters go to stored properties
- Use `LazyVStack`/`LazyHStack` for scrollable content with 20+ items
- Pass only needed values to subviews — don't pass entire model when view needs one property
- Prefer modifiers over conditional views for state toggling (preserves view identity)
