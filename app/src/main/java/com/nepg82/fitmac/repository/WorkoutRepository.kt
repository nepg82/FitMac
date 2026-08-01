package com.nepg82.fitmac.repository

import com.nepg82.fitmac.data.database.dao.WorkoutDao
import com.nepg82.fitmac.data.database.entities.WorkoutEntry
import kotlinx.coroutines.flow.Flow

class WorkoutRepository(
    private val workoutDao: WorkoutDao
) {

    val allWorkouts: Flow<List<WorkoutEntry>> = workoutDao.getAllWorkouts()

    suspend fun insertWorkout(workout: WorkoutEntry) {
        workoutDao.insertWorkout(workout)
    }

    suspend fun deleteWorkout(workout: WorkoutEntry) {
        workoutDao.deleteWorkout(workout)
    }
}