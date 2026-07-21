package com.nepg82.fitmac.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Scale
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

data class BottomNavItem(
    val route: String,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
)

private val items = listOf(
    BottomNavItem(
        route = "dashboard",
        label = "Home",
        icon = Icons.Default.Home
    ),
    BottomNavItem(
        route = "meals",
        label = "Meals",
        icon = Icons.Default.List
    ),
    BottomNavItem(
        route = "weight",
        label = "Weight",
        icon = Icons.Default.Scale
    ),
    BottomNavItem(
        route = "settings",
        label = "Settings",
        icon = Icons.Default.Settings
    )
)

@Composable
fun BottomNavigationBar(
    navController: NavController,
    currentRoute: String?
) {

    NavigationBar {

        items.forEach { item ->

            NavigationBarItem(
                selected = currentRoute == item.route,
                onClick = {
                    navController.navigate(item.route) {
                        launchSingleTop = true
                    }
                },
                icon = {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.label
                    )
                },
                label = {
                    Text(item.label)
                }
            )

        }
    }
}