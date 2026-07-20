package com.nepg82.fitmac.data.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity
data class Meal(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,

    val name: String,

    val date: Long = System.currentTimeMillis()
)