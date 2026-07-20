package com.nepg82.fitmac

import android.app.Application
import androidx.room.Room
import com.nepg82.fitmac.data.database.AppDatabase

class FitMacApplication : Application() {

    val database: AppDatabase by lazy {
        Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java,
            "fitmac_database"
        ).build()
    }
}