# Kotlin Compose Architecture

## MVVM with ViewModel + StateFlow

Every screen has a ViewModel that owns the UI state:

```kotlin
class HomeViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    fun onAction(action: HomeAction) {
        when (action) {
            is HomeAction.Search -> _uiState.update { it.copy(query = action.query) }
            is HomeAction.Refresh -> loadItems()
        }
    }

    private fun loadItems() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val items = repository.getItems()
            _uiState.update { it.copy(items = items, isLoading = false) }
        }
    }
}

data class HomeUiState(
    val items: List<Item> = emptyList(),
    val isLoading: Boolean = false,
    val query: String = ""
)
```

## Directory Structure

```
app/src/main/java/com/dtc/app/
  MainActivity.kt           — entry point (DO NOT MODIFY)
  data/
    models/                  — data classes (Serializable)
    repository/              — data access (Repository pattern)
  ui/
    screens/                 — one @Composable per screen
    components/              — reusable composables
    viewmodels/              — ViewModel classes
    theme/                   — Theme.kt, Color.kt, Type.kt
    navigation/              — NavHost + route definitions
```

## Navigation

Use Navigation Compose with type-safe routes:

```kotlin
@Serializable object HomeRoute
@Serializable data class DetailRoute(val id: String)

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    NavHost(navController, startDestination = HomeRoute) {
        composable<HomeRoute> { HomeScreen(navController) }
        composable<DetailRoute> { backStackEntry ->
            DetailScreen(id = backStackEntry.toRoute<DetailRoute>().id)
        }
    }
}
```

## State Management Rules

- ViewModel exposes `StateFlow<UiState>` — never `MutableState` directly
- Composables collect state with `collectAsStateWithLifecycle()`
- Pass events UP via lambdas: `onAction: (Action) -> Unit`
- Pass state DOWN via parameters: `uiState: UiState`
- Use `viewModelScope.launch` for coroutines, never `GlobalScope`

## Testing

- Set `Modifier.testTag("id")` on ALL interactive composables
- The root composable has `Modifier.semantics { testTagsAsResourceId = true }` (already in MainActivity)
- ViewModel tests: local JUnit tests in `app/src/test/`
- UI tests: Compose test rules in `app/src/androidTest/`
