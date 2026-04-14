# SwiftUI API Quick Reference

Incorrect signatures cause build failures. Follow these exactly.

## TextField

```swift
// String binding
TextField("Label", text: $viewModel.name)

// Numeric binding (iOS 15+)
TextField("Amount", value: $viewModel.amount, format: .number)
TextField("Price", value: $viewModel.price, format: .currency(code: "USD"))

// WILL NOT COMPILE:
// TextField("Amount", value: $amount, specifier: "%.2f")  ← does not exist
// TextField("Amount", value: $amount, default: 0)          ← does not exist
```

## ForEach

```swift
ForEach(items) { item in ... }                           // Identifiable required
ForEach(items, id: \.self) { item in ... }               // Hashable required
ForEach(Array(items.enumerated()), id: \.offset) { ... } // indexed iteration

// WRONG — never use for dynamic data:
// ForEach(0..<items.count) { index in ... }
```

ForEach MUST use stable identity — never `.indices` or array index for dynamic content.

## Async/Await in Views

```swift
.task { await viewModel.loadData() }     // CORRECT
Button("Go") { Task { await doWork() } } // CORRECT
// NEVER call async directly in body
```

## Common Modifiers

```swift
.foregroundStyle(.primary)                    // NOT foregroundColor()
.clipShape(.rect(cornerRadius: 12))           // NOT cornerRadius(12)
.font(.headline)                              // NOT Font.custom(..., size: 16)
.frame(maxWidth: .infinity)                   // full-width
```

## Sheets, Alerts, Confirmations

```swift
// Sheet
.sheet(item: $selectedItem) { item in DetailView(item: item) }

// Alert (iOS 15+)
.alert("Error", isPresented: $showError) {
    Button("OK", role: .cancel) { }
} message: {
    Text(errorMessage)
}
```

## @Observable ViewModel Pattern

```swift
@MainActor @Observable
final class MyViewModel {
    var items: [Item] = []
    var isLoading = false

    // Task property for cancellation in deinit
    @ObservationIgnored nonisolated(unsafe) private var loadTask: Task<Void, Never>?

    deinit { loadTask?.cancel() }

    func loadItems() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await api.fetch()) ?? []
    }
}

// View side
struct MyView: View {
    @State private var viewModel = MyViewModel()
    var body: some View {
        List(viewModel.items) { ... }
            .task { await viewModel.loadItems() }
    }
}
```

## @Bindable for @Observable Environment

```swift
@Environment(MyModel.self) var model
var body: some View {
    @Bindable var model = model   // Required wrapper for $ syntax
    TextField("Name", text: $model.name)
}
```

## TabView — use enum, not Int

```swift
enum AppTab { case home, search, favorites, profile }
TabView(selection: $selectedTab) {
    Tab("Home", systemImage: "house", value: .home) { HomeView() }
}
```
