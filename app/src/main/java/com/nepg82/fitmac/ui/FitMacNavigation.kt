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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nepg82.fitmac.FitMacApplication
import com.nepg82.fitmac.repository.WorkoutRepository
import com.nepg82.fitmac.viewmodel.WorkoutViewModel
import com.nepg82.fitmac.viewmodel.WorkoutViewModelFactory
import androidx.compose.ui.platform.LocalContext

@Composable
fun FitMacNavigation(
    paddingValues: PaddingValues,
    navController: NavHostController
) {

    val context = LocalContext.current
    val database = (context.applicationContext as FitMacApplication).database

    val workoutRepository = WorkoutRepository(
        database.workoutDao()
    )

    val workoutViewModel: WorkoutViewModel = viewModel(
        factory = WorkoutViewModelFactory(workoutRepository)
    )

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
            WorkoutScreen(
                viewModel = workoutViewModel
            )
        }

        composable("settings") {
            SettingsScreen()
        }
    }
}