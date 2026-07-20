package com.nepg82.fitmac.repository

import com.nepg82.fitmac.data.database.dao.MealDao
import com.nepg82.fitmac.data.database.entities.Meal
import kotlinx.coroutines.flow.Flow

class MealRepository(
    private val mealDao: MealDao
) {

    val allMeals: Flow<List<Meal>> = mealDao.getAllMeals()

    suspend fun insertMeal(meal: Meal) {
        mealDao.insertMeal(meal)
    }

    suspend fun deleteMeal(meal: Meal) {
        mealDao.deleteMeal(meal)
    }
}