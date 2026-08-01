package com.nepg82.fitmac.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nepg82.fitmac.data.database.entities.WorkoutEntry
import com.nepg82.fitmac.repository.WorkoutRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

class WorkoutViewModel(
    private val repository: WorkoutRepository
) : ViewModel() {

    val workouts: Flow<List<WorkoutEntry>> = repository.allWorkouts

    fun addWorkout(
        workoutName: String,
        exercise: String,
        sets: Int,
        reps: Int,
        weight: Double,
        notes: String
    ) {
        viewModelScope.launch {
            repository.insertWorkout(
                WorkoutEntry(
                    workoutName = workoutName,
                    exercise = exercise,
                    sets = sets,
                    reps = reps,
                    weight = weight,
                    notes = notes
                )
            )
        }
    }

    fun deleteWorkout(workout: WorkoutEntry) {
        viewModelScope.launch {
            repository.deleteWorkout(workout)
        }
    }
}