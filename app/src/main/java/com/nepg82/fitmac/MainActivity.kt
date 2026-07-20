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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nepg82.fitmac.data.database.entities.Meal
import com.nepg82.fitmac.repository.MealRepository
import com.nepg82.fitmac.ui.theme.FitMacTheme
import com.nepg82.fitmac.viewmodel.MealViewModel
import com.nepg82.fitmac.viewmodel.MealViewModelFactory

class MainActivity : ComponentActivity() {

    private val database by lazy {
        (application as FitMacApplication).database
    }

    private val repository by lazy {
        MealRepository(
            database.mealDao()
        )
    }

    private val viewModelFactory by lazy {
        MealViewModelFactory(
            repository
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()

        setContent {
            FitMacTheme {

                val mealViewModel: MealViewModel = viewModel(
                    factory = viewModelFactory
                )

                Scaffold(
                    modifier = Modifier.fillMaxSize()
                ) { innerPadding ->

                    MealTestScreen(
                        viewModel = mealViewModel,
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }
}

@Composable
fun MealTestScreen(
    viewModel: MealViewModel,
    modifier: Modifier = Modifier
) {
    val meals by viewModel.meals
        .collectAsState(initial = emptyList())

    Column(
        modifier = modifier.padding(16.dp)
    ) {

        Button(
            onClick = {
                viewModel.addMeal(
                    "Test Breakfast"
                )
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