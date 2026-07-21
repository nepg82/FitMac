package com.nepg82.fitmac

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import com.nepg82.fitmac.ui.FitMacNavigation
import com.nepg82.fitmac.ui.theme.FitMacTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()

        setContent {
            FitMacTheme {

                Scaffold(
                    modifier = Modifier.fillMaxSize()
                ) {
                    FitMacNavigation(
                        paddingValues = it
                    )
                }
            }
        }
    }
}