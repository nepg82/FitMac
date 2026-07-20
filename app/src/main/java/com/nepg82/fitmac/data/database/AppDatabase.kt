package com.nepg82.fitmac.data.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.nepg82.fitmac.data.database.dao.MealDao
import com.nepg82.fitmac.data.database.entities.Meal

@Database(
    entities = [Meal::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun mealDao(): MealDao
}