package com.nepg82.fitmac.data.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import com.nepg82.fitmac.data.database.entities.Meal
import kotlinx.coroutines.flow.Flow

@Dao
interface MealDao {

    @Query("SELECT * FROM Meal ORDER BY date DESC")
    fun getAllMeals(): Flow<List<Meal>>

    @Insert
    suspend fun insertMeal(meal: Meal)

    @Delete
    suspend fun deleteMeal(meal: Meal)
}