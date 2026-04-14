# Swift 6 Concurrency Error Patterns

These are the most common build errors in Swift 6 projects.

## Data Race — Missing @MainActor

**Error:** `sending 'X' risks causing data races` or `capture of 'X' with non-sendable type`

**Fix:** Add `@MainActor` to the class. ALL `@Observable` ViewModels MUST have `@MainActor`.

```swift
// WRONG
@Observable class ItemsViewModel { ... }

// CORRECT
@MainActor @Observable
final class ItemsViewModel { ... }
```

## Main Actor Isolation

**Error:** `main actor-isolated 'X' can not be referenced from a non-isolated context`

**Fix:** Mark the caller as `@MainActor` or use `await`.

## Non-Sendable Type

**Error:** `non-sendable type 'X' returned by implicitly asynchronous call`

**Fix:** Make the type `Sendable`:
- `struct` with all `Sendable` properties → automatically `Sendable`
- `enum` with all `Sendable` associated values → automatically `Sendable`
- `final class` with `let`-only `Sendable` properties → add `: Sendable`
- Third-party types → `@preconcurrency import ThirdPartyModule`

## Global Mutable State

**Error:** `'X' is not concurrency-safe because it is nonisolated global shared mutable state`

**Fix:** Add `@MainActor` or use an `actor`:
```swift
// WRONG
var globalCache: [String: Any] = [:]

// CORRECT
@MainActor var globalCache: [String: Any] = [:]
```

## Delegate Protocol Conformance

**Error:** `conformance crosses into main actor-isolated code`

**Fix:** Use `@preconcurrency` extension:
```swift
// WRONG
class GameScene: SKScene, SKPhysicsContactDelegate { ... }

// CORRECT
class GameScene: SKScene { ... }
extension GameScene: @preconcurrency SKPhysicsContactDelegate {
    func didBegin(_ contact: SKPhysicsContact) { ... }
}
```

This applies to ALL delegate protocols: `SKPhysicsContactDelegate`, `CLLocationManagerDelegate`, `MKMapViewDelegate`, `WKNavigationDelegate`, etc.

## @MainActor Property in Sendable Closure

**Error:** `@MainActor property can not be referenced from Sendable closure`

**Fix:** Pre-capture as `let`:
```swift
let currentItems = items  // capture before closure
Task { process(currentItems) }
```
Or use `.task { @MainActor in }`.

## Static Mutable State

**Error:** `static property 'shared' is not concurrency-safe`

**Fix:** Add `nonisolated(unsafe)` to static `let` properties, or `@MainActor` to the class.

## Task Property in deinit

**Error:** Accessing Task property in `deinit` causes isolation errors

**Fix:**
```swift
@ObservationIgnored nonisolated(unsafe) private var loadTask: Task<Void, Never>?
deinit { loadTask?.cancel() }
```

## EnvironmentKey with @MainActor ViewModel — Runtime Crash

**Error:** `EXC_BREAKPOINT` / `_assertionFailure` in `EnvironmentKey.defaultValue` initialization

**Cause:** Custom `EnvironmentKey` with a `@MainActor` ViewModel as `defaultValue` crashes because `defaultValue` runs in a nonisolated `dispatch_once` context.

**Fix:** NEVER share `@MainActor @Observable` ViewModels via custom `EnvironmentKey`. Use `@State` per view instead:
```swift
// WRONG — crashes at runtime
struct TodoListViewModelKey: EnvironmentKey {
    static var defaultValue = TodoListViewModel()  // CRASH: MainActor in nonisolated context
}

// CORRECT — each view owns its ViewModel
struct TodoListView: View {
    @State private var viewModel = TodoListViewModel()
}
```
