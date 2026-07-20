package com.nepg82.fitmac.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nepg82.fitmac.data.database.entities.Meal
import com.nepg82.fitmac.repository.MealRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

class MealViewModel(
    private val repository: MealRepository
) : ViewModel() {

    val meals: Flow<List<Meal>> = repository.allMeals

    fun addMeal(name: String) {
        viewModelScope.launch {
            repository.insertMeal(
                Meal(
                    name = name
                )
            )
        }
    }

    fun deleteMeal(meal: Meal) {
        viewModelScope.launch {
            repository.deleteMeal(meal)
        }
    }
}