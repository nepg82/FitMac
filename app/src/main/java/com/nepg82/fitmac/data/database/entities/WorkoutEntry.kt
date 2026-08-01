package com.nepg82.fitmac.data.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity
data class WorkoutEntry(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,

    val exercise: String,

    val sets: Int,

    val reps: Int,

    val weight: Double,

    val notes: String = "",

    val date: Long = System.currentTimeMillis()
)