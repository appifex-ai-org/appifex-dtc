# SwiftUI Architecture Rules (iOS 17+, Swift 6)

## MVVM Directory Structure

```
Sources/
  App.swift                    # @main entry point (auto-generated — do NOT create)
  ContentView.swift            # Main view
  Views/                       # SwiftUI views
  ViewModels/                  # @Observable view models
  Models/                      # Domain models (Codable, Identifiable)
  Services/                    # Network, persistence, etc.
```

`App.swift` is the ONLY file allowed at `Sources/` root. ALL views go in `Views/`, ALL view models in `ViewModels/`, etc.

## Edge-to-Edge Layout (MANDATORY)

The root container (`ContentView.swift`) MUST use `.background(Color(...).ignoresSafeArea())` so the background color extends behind the status bar and home indicator. Without this, the app shows black bars at the top and bottom of the screen.

## State Management: @MainActor @Observable

- Use `@MainActor @Observable final class` on ALL ViewModels
- Views observe with `@State private var viewModel = MyViewModel()`
- NEVER use `ObservableObject`, `@Published`, `@StateObject`, `@ObservedObject`, or `@EnvironmentObject`
- `@Observable` requires `import Observation` in files that do NOT `import SwiftUI`
- NEVER use `lazy var` on `@Observable` classes
- NEVER share ViewModels via custom `EnvironmentKey` — crashes at runtime (dispatch_once is nonisolated)

```swift
@MainActor @Observable
final class ItemsViewModel {
    var items: [Item] = []
    var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await api.fetchItems()) ?? []
    }
}

struct ItemsView: View {
    @State private var viewModel = ItemsViewModel()

    var body: some View {
        List(viewModel.items) { item in Text(item.name) }
            .task { await viewModel.load() }
    }
}
```

## Navigation Decision Table

- **≤2 screens or sequential flow** → `NavigationStack` only
- **3–5 independent sections** → `TabView` + `NavigationStack` per tab
- **List → detail as core interaction** → `NavigationSplitView`

NEVER create a TabView with fewer than 3 tabs.

Use `navigationDestination(for:)` — NEVER `NavigationLink(destination:)`:
```swift
NavigationLink(value: item) { ItemRow(item: item) }
.navigationDestination(for: Item.self) { item in
    ItemDetailView(item: item)
}
```

## Sheet Presentation

Prefer `.sheet(item:)` over `.sheet(isPresented:)`:
```swift
.sheet(item: $selectedItem) { item in
    DetailView(item: item)
}
```

## Accessibility (MANDATORY)

- `.accessibilityIdentifier()` for test IDs — required on EVERY interactive element for Maestro UI tests
- `.accessibilityLabel()` on all `Image` views — if decorative, use `Image(decorative:)` or `.accessibilityHidden(true)`
- Minimum 44pt touch targets
- Minimum 4.5:1 contrast ratio
- Prefer Dynamic Type (`.font(.body)`, `.font(.headline)`) — never hardcode font sizes
- Use `@ScaledMetric` for custom numeric values that should scale with Dynamic Type
- Buttons MUST always include text, even if invisible: `Button("Label", systemImage: "plus", action: myAction)` — icon-only buttons without text labels are bad for VoiceOver
- Never use `onTapGesture()` for buttons — use `Button`. If `onTapGesture()` is unavoidable, add `.accessibilityAddTraits(.isButton)`
- If color is an important differentiator, respect `.accessibilityDifferentiateWithoutColor` — add icons, patterns, or strokes beyond just color
- If the user has Reduce Motion enabled, replace large animations with opacity transitions
- `Menu` must include text: `Menu("Options", systemImage: "ellipsis.circle") { }` not just an image
