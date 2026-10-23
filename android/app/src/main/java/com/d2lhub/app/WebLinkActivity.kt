package com.d2lhub.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.d2lhub.app.ui.D2lHubTheme
import com.d2lhub.app.ui.WebLinkScreen

class WebLinkActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            finish()
            return
        }
        setContent {
            D2lHubTheme {
                WebLinkScreen(url = url, onClose = { finish() })
            }
        }
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}
