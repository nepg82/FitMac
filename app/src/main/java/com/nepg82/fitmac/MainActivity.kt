package com.nepg82.fitmac

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import com.nepg82.fitmac.data.database.entities.Meal
import com.nepg82.fitmac.ui.theme.FitMacTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val database by lazy {
        (application as FitMacApplication).database
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            FitMacTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->

                    MealTestScreen(
                        modifier = Modifier.padding(innerPadding)
                    )

                }
            }
        }
    }

    @Composable
    private fun MealTestScreen(
        modifier: Modifier = Modifier
    ) {
        val meals by database.mealDao()
            .getAllMeals()
            .collectAsState(initial = emptyList())

        Column(
            modifier = modifier.padding(16.dp)
        ) {

            Button(
                onClick = {
                    lifecycleScope.launch {
                        database.mealDao().insertMeal(
                            Meal(
                                name = "Test Breakfast"
                            )
                        )
                    }
                }
            ) {
                Text("Add Test Meal")
            }

            meals.forEach { meal ->
                Text(
                    text = meal.name,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}