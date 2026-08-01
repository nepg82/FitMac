package com.nepg82.fitmac.data.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import com.nepg82.fitmac.data.database.entities.WorkoutEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutDao {

    @Query("SELECT * FROM WorkoutEntry ORDER BY date DESC")
    fun getAllWorkouts(): Flow<List<WorkoutEntry>>

    @Insert
    suspend fun insertWorkout(workout: WorkoutEntry)

    @Delete
    suspend fun deleteWorkout(workout: WorkoutEntry)
}