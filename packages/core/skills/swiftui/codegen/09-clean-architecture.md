# Clean Architecture for Complex Apps (iOS 17+, Swift 6)

Read this skill when the app has **3+ screens with distinct data flows**, multiple data sources, or complex business logic. For simple 1-2 screen apps, stick with `01-architecture.md` (flat MVVM).

## When to Use Clean Architecture

```text
How many screens with distinct data?
├─ 1-2 screens → Flat MVVM (01-architecture.md)
│
└─ 3+ screens → How complex is the business logic?
   ├─ Simple CRUD → Lightweight: ViewModel → Repository directly
   └─ Validation, orchestration, multiple data sources
      └─ Full Clean Architecture (this skill)
```

## Layered Directory Structure

```
Sources/
  App.swift                          # @main (auto-generated — do NOT create)
  ContentView.swift                  # Root navigation

  Domain/                            # NO framework imports except Foundation
    Models/                          # Pure structs: Identifiable, Equatable, Sendable
    Protocols/                       # Repository protocols (implemented in Data/)
    UseCases/                        # Business logic — one per operation

  Data/                              # Implements Domain protocols
    Repositories/                    # Repository implementations
    DataSources/                     # Network clients, local storage
    DTOs/                            # Codable transfer objects
    Mappers/                         # DTO ↔ Entity conversion

  Presentation/                      # SwiftUI + ViewModels
    Views/                           # SwiftUI views
    ViewModels/                      # @MainActor @Observable classes
    Components/                      # Reusable UI components
```

## Dependency Rule

```text
Presentation → Domain ← Data

✅ Presentation imports Domain (UseCases, Entities)
✅ Data imports Domain (implements Repository protocols)
❌ Domain imports NOTHING from other layers
❌ Domain NEVER imports SwiftUI, UIKit, SwiftData, or networking frameworks
```

## Domain Layer Rules

### Entities — pure value types
```swift
// Domain/Models/Order.swift
struct Order: Identifiable, Equatable, Sendable {
    let id: UUID
    let items: [OrderItem]
    let createdAt: Date

    // Computed properties that need NO external data are OK
    var total: Decimal { items.reduce(0) { $0 + $1.price * Decimal($1.quantity) } }
}
```

**NEVER** add `Codable` to entities — that couples to serialization format. DTOs handle Codable.

### Repository Protocols — defined in Domain, implemented in Data
```swift
// Domain/Protocols/OrderRepository.swift
protocol OrderRepository: Sendable {
    func fetchAll() async throws -> [Order]
    func save(_ order: Order) async throws
    func delete(id: UUID) async throws
}
```

### UseCases — one per business operation
```swift
// Domain/UseCases/PlaceOrderUseCase.swift
struct PlaceOrderUseCase: Sendable {
    let orderRepository: OrderRepository
    let inventoryRepository: InventoryRepository

    func execute(cart: Cart) async throws -> Order {
        // Validate stock
        for item in cart.items {
            guard try await inventoryRepository.isInStock(item.productId) else {
                throw DomainError.outOfStock(item.name)
            }
        }
        // Create and save order
        let order = Order(id: UUID(), items: cart.items.map { $0.toOrderItem() }, createdAt: .now)
        try await orderRepository.save(order)
        return order
    }
}
```

**Skip the UseCase** when there's no business logic — `ViewModel → Repository` directly is fine for simple CRUD.

## Data Layer Rules

### DTOs — Codable, match API/storage format
```swift
// Data/DTOs/OrderDTO.swift
struct OrderDTO: Codable {
    let id: String
    let items: [OrderItemDTO]
    let created_at: String  // API snake_case
}
```

### Mappers — DTO ↔ Entity, live in Data layer ONLY
```swift
// Data/Mappers/OrderMapper.swift
enum OrderMapper {
    static func toDomain(_ dto: OrderDTO) throws -> Order {
        guard let id = UUID(uuidString: dto.id) else {
            throw MappingError.invalidId(dto.id)
        }
        return Order(
            id: id,
            items: try dto.items.map { try OrderItemMapper.toDomain($0) },
            createdAt: try DateFormatter.api.parse(dto.created_at)
        )
    }
}
```

**NEVER** silently default on invalid data — throw errors so the UseCase can handle them.

### Repository Implementation
```swift
// Data/Repositories/DefaultOrderRepository.swift
final class DefaultOrderRepository: OrderRepository, Sendable {
    private let remote: OrderRemoteDataSource
    private let local: OrderLocalDataSource

    init(remote: OrderRemoteDataSource, local: OrderLocalDataSource) {
        self.remote = remote
        self.local = local
    }

    func fetchAll() async throws -> [Order] {
        let dtos = try await remote.fetchOrders()
        let orders = try dtos.map { try OrderMapper.toDomain($0) }
        try? await local.saveAll(dtos)  // Cache for offline
        return orders
    }
}
```

## Presentation Layer Rules

### ViewModels depend on protocols, not concrete types
```swift
// Presentation/ViewModels/OrderListViewModel.swift
@MainActor @Observable
final class OrderListViewModel {
    private let fetchOrders: FetchOrdersUseCase
    private let placeOrder: PlaceOrderUseCase

    var orders: [Order] = []
    var isLoading = false
    var error: String?

    init(fetchOrders: FetchOrdersUseCase, placeOrder: PlaceOrderUseCase) {
        self.fetchOrders = fetchOrders
        self.placeOrder = placeOrder
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            orders = try await fetchOrders.execute()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
```

## Minimal Dependency Container

For DTC-generated apps, use a simple factory — no DI framework needed:

```swift
// Sources/Container.swift
@MainActor
final class Container {
    static let shared = Container()

    // Data sources
    private lazy var networkClient = NetworkClient()
    private lazy var orderRemote = OrderRemoteDataSource(client: networkClient)
    private lazy var orderLocal = OrderLocalDataSource()

    // Repositories
    lazy var orderRepository: OrderRepository = DefaultOrderRepository(
        remote: orderRemote, local: orderLocal
    )

    // UseCases
    func makeFetchOrdersUseCase() -> FetchOrdersUseCase {
        FetchOrdersUseCase(repository: orderRepository)
    }

    // ViewModels
    func makeOrderListViewModel() -> OrderListViewModel {
        OrderListViewModel(fetchOrders: makeFetchOrdersUseCase(), placeOrder: makePlaceOrderUseCase())
    }
}
```

## Red Flags Checklist

| Smell | Problem | Fix |
|-------|---------|-----|
| `import SwiftUI` in Domain | Layer violation | Move to Presentation |
| UseCase just calls `repo.get()` | Unnecessary abstraction | ViewModel → Repo directly |
| `Codable` on Entity | Serialization coupling | Keep Codable on DTOs only |
| Business logic in Repository | Wrong layer | Move to UseCase |
| ViewModel imports NetworkClient | Skipped layers | Use Repository |
| Silent defaults in Mapper | Hides bugs | Throw on invalid data |
