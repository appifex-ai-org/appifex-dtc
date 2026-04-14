# Compose API Reference

## Common Compilation Errors and Correct Signatures

### TextField
```kotlin
// CORRECT — OutlinedTextField with value + onValueChange
OutlinedTextField(
    value = text,
    onValueChange = { text = it },
    label = { Text("Search") },
    modifier = Modifier.fillMaxWidth().testTag("search_field")
)

// WRONG — no positional string parameter
// OutlinedTextField("text")  // Does not compile
```

### LazyColumn
```kotlin
// CORRECT — items with key for stable identity
LazyColumn {
    items(items = list, key = { it.id }) { item ->
        ItemRow(item)
    }
}

// WRONG — never use itemsIndexed without a key
```

### Navigation
```kotlin
// CORRECT — type-safe navigation (Navigation Compose 2.8+)
@Serializable object HomeRoute
@Serializable data class DetailRoute(val id: String)

NavHost(navController, startDestination = HomeRoute) {
    composable<HomeRoute> { HomeScreen() }
    composable<DetailRoute> { backStackEntry ->
        val route = backStackEntry.toRoute<DetailRoute>()
        DetailScreen(route.id)
    }
}

// Navigate
navController.navigate(DetailRoute(id = "123"))
```

### BottomNavigation
```kotlin
// CORRECT — Material 3 NavigationBar
NavigationBar {
    items.forEachIndexed { index, item ->
        NavigationBarItem(
            icon = { Icon(item.icon, contentDescription = item.label) },
            label = { Text(item.label) },
            selected = currentIndex == index,
            onClick = { onTabSelected(index) }
        )
    }
}
```

### Image Loading (Coil)
```kotlin
// CORRECT — AsyncImage from Coil
AsyncImage(
    model = imageUrl,
    contentDescription = "Photo",
    contentScale = ContentScale.Crop,
    modifier = Modifier.fillMaxWidth().height(200.dp).testTag("hero_image")
)
```

### Scaffold
```kotlin
// CORRECT — Material 3 Scaffold
Scaffold(
    topBar = { TopAppBar(title = { Text("Home") }) },
    bottomBar = { NavigationBar { /* items */ } },
    floatingActionButton = { FloatingActionButton(onClick = {}) { Icon(Icons.Default.Add, "Add") } }
) { paddingValues ->
    // Content MUST use paddingValues
    Column(modifier = Modifier.padding(paddingValues)) {
        // screen content
    }
}
```

## Modifier Ordering Rules

Order matters in Compose modifiers:
1. `clickable` / `toggleable` before `padding` (for larger click area)
2. `background` after `clip` (clip applies to background too)
3. `padding` before `background` for inner padding, after for outer padding
4. `testTag` can go anywhere but prefer at the end

## @Composable Rules

- Never call `@Composable` functions inside `LaunchedEffect` or `remember` lambdas
- Never call suspend functions directly in a composable — use `LaunchedEffect` or ViewModel
- `remember` preserves state across recompositions — use for expensive computations
- `rememberSaveable` preserves state across configuration changes
