package com.nepg82.fitmac.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.nepg82.fitmac.ui.dashboard.DashboardScreen
import com.nepg82.fitmac.ui.meals.MealsScreen
import com.nepg82.fitmac.ui.settings.SettingsScreen
import com.nepg82.fitmac.ui.weight.WeightScreen
import com.nepg82.fitmac.ui.workout.WorkoutScreen

@Composable
fun FitMacNavigation(
    paddingValues: PaddingValues,
    navController: NavHostController
) {

    NavHost(
        navController = navController,
        startDestination = "dashboard",
        modifier = Modifier.padding(paddingValues)
    ) {

        composable("dashboard") {
            DashboardScreen()
        }

        composable("meals") {
            MealsScreen()
        }

        composable("weight") {
            WeightScreen()
        }

        composable("workout") {
            WorkoutScreen()
        }

        composable("settings") {
            SettingsScreen()
        }
    }
}