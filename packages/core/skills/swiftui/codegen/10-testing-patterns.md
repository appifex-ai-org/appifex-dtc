# Testing Patterns for SwiftUI Apps (iOS 17+, Swift 6)

Read this skill when writing unit tests. Covers mock-based testing with protocol conformance, ViewModel testing, and test file organization.

## Test Directory Structure

```
__tests__/
  ModelTests.swift          # Domain model tests
  ViewModelTests.swift      # ViewModel state + action tests
  ViewTests.swift           # View instantiation tests
  RepositoryTests.swift     # Repository coordination tests (if Clean Architecture)
  UseCaseTests.swift        # Business logic tests (if Clean Architecture)
```

## Protocol-Based Mocking

Define repository protocols so tests can inject mocks without real persistence or network:

```swift
// Domain/Protocols/ItemRepository.swift
protocol ItemRepository: Sendable {
    func fetchAll() async throws -> [Item]
    func save(_ item: Item) async throws
    func delete(id: UUID) async throws
}
```

### Manual Mock Implementation

```swift
// __tests__/Mocks/MockItemRepository.swift
final class MockItemRepository: ItemRepository, @unchecked Sendable {
    var stubbedItems: [Item] = []
    var stubbedError: Error?
    var savedItems: [Item] = []
    var deletedIds: [UUID] = []

    func fetchAll() async throws -> [Item] {
        if let error = stubbedError { throw error }
        return stubbedItems
    }

    func save(_ item: Item) async throws {
        if let error = stubbedError { throw error }
        savedItems.append(item)
    }

    func delete(id: UUID) async throws {
        if let error = stubbedError { throw error }
        deletedIds.append(id)
    }
}
```

**Key pattern**: Mocks have `stubbed*` properties (return values) and tracking arrays (`saved*`, `deleted*`) to verify calls.

## ViewModel Testing

### Test state changes after actions

```swift
import XCTest
@testable import AppName

final class ItemListViewModelTests: XCTestCase {
    private var sut: ItemListViewModel!
    private var mockRepo: MockItemRepository!

    @MainActor
    override func setUp() {
        mockRepo = MockItemRepository()
        sut = ItemListViewModel(repository: mockRepo)
    }

    @MainActor
    func testLoadItems_success() async {
        mockRepo.stubbedItems = [
            Item(id: UUID(), title: "Buy milk", isDone: false),
            Item(id: UUID(), title: "Walk dog", isDone: true),
        ]

        await sut.loadItems()

        XCTAssertEqual(sut.items.count, 2)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
    }

    @MainActor
    func testLoadItems_failure() async {
        mockRepo.stubbedError = NSError(domain: "test", code: -1)

        await sut.loadItems()

        XCTAssertTrue(sut.items.isEmpty)
        XCTAssertNotNil(sut.error)
    }

    @MainActor
    func testAddItem() async throws {
        try await sut.addItem(title: "New task")

        XCTAssertEqual(mockRepo.savedItems.count, 1)
        XCTAssertEqual(mockRepo.savedItems.first?.title, "New task")
    }

    @MainActor
    func testDeleteItem() async throws {
        let id = UUID()
        mockRepo.stubbedItems = [Item(id: id, title: "Delete me", isDone: false)]
        await sut.loadItems()

        try await sut.deleteItem(id: id)

        XCTAssertEqual(mockRepo.deletedIds, [id])
    }

    @MainActor
    func testToggleItem() async throws {
        let id = UUID()
        let item = Item(id: id, title: "Toggle me", isDone: false)
        mockRepo.stubbedItems = [item]
        await sut.loadItems()

        try await sut.toggleItem(id: id)

        XCTAssertEqual(mockRepo.savedItems.last?.isDone, true)
    }
}
```

## Model Testing

### Test initialization, computed properties, Codable round-trip

```swift
final class ItemModelTests: XCTestCase {
    func testItemInitialization() {
        let item = Item(id: UUID(), title: "Test", isDone: false)
        XCTAssertEqual(item.title, "Test")
        XCTAssertFalse(item.isDone)
    }

    func testItemToggle() {
        var item = Item(id: UUID(), title: "Test", isDone: false)
        item.isDone.toggle()
        XCTAssertTrue(item.isDone)
    }

    func testOrderTotal() {
        let order = Order(items: [
            OrderItem(name: "A", price: 10, quantity: 2),
            OrderItem(name: "B", price: 5, quantity: 1),
        ])
        XCTAssertEqual(order.total, 25)
    }
}
```

## UseCase Testing (Clean Architecture)

```swift
final class PlaceOrderUseCaseTests: XCTestCase {
    private var sut: PlaceOrderUseCase!
    private var mockOrderRepo: MockOrderRepository!
    private var mockInventoryRepo: MockInventoryRepository!

    override func setUp() {
        mockOrderRepo = MockOrderRepository()
        mockInventoryRepo = MockInventoryRepository()
        sut = PlaceOrderUseCase(
            orderRepository: mockOrderRepo,
            inventoryRepository: mockInventoryRepo
        )
    }

    func testExecute_allInStock_createsOrder() async throws {
        mockInventoryRepo.stubbedInStock = true

        let order = try await sut.execute(cart: Cart(items: [.sample]))

        XCTAssertEqual(mockOrderRepo.savedOrders.count, 1)
        XCTAssertFalse(order.items.isEmpty)
    }

    func testExecute_outOfStock_throws() async {
        mockInventoryRepo.stubbedInStock = false

        do {
            _ = try await sut.execute(cart: Cart(items: [.sample]))
            XCTFail("Expected error")
        } catch {
            XCTAssertEqual(error as? DomainError, .outOfStock("Sample"))
        }
    }
}
```

## View Instantiation Tests

Verify views can be created without crashing:

```swift
final class ViewInstantiationTests: XCTestCase {
    @MainActor
    func testContentViewCreation() {
        let view = ContentView()
        XCTAssertNotNil(view)
    }

    @MainActor
    func testItemListViewCreation() {
        let view = ItemListView()
        XCTAssertNotNil(view)
    }

    @MainActor
    func testItemDetailViewCreation() {
        let item = Item(id: UUID(), title: "Test", isDone: false)
        let view = ItemDetailView(item: item)
        XCTAssertNotNil(view)
    }
}
```

## Testing Rules

- **Every ViewModel gets a mock repository** — never use real persistence in unit tests
- **Test observable state changes** — assert on `items`, `isLoading`, `error` after calling async methods
- **Use `@MainActor` on setUp and test methods** when testing ViewModels (they're `@MainActor`)
- **Test error paths** — stub errors on mocks and verify ViewModel handles them
- **Test edge cases** — empty lists, duplicate items, concurrent operations
- **Keep mocks simple** — stubbedReturn + trackingArray, no complex logic in mocks
- **Use `@testable import AppName`** in all test files
