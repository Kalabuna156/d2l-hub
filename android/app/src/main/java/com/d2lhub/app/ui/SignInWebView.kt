package com.d2lhub.app.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.d2lhub.app.data.D2lClient

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SignInWebView(
    baseUrl: String,
    onSignedIn: (baseUrl: String, cookie: String) -> Unit,
    onCancel: () -> Unit,
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    var progress by remember { mutableStateOf(0) }
    var signedIn by remember { mutableStateOf(false) }

    fun sessionCookies(): String {
        val raw = CookieManager.getInstance().getCookie(baseUrl).orEmpty()
        return raw.split(";")
            .map { it.trim() }
            .filter { it.contains("=") && it.substringBefore("=").isNotBlank() }
            .joinToString("; ")
    }

    fun checkSession() {
        if (signedIn) return
        val cookies = sessionCookies()
        if (Regex("(^|;\\s*)d2l(Secure)?SessionVal=", RegexOption.IGNORE_CASE).containsMatchIn(cookies)) {
            signedIn = true
            CookieManager.getInstance().flush()
            onSignedIn(baseUrl, cookies)
        }
    }

    BackHandler {
        val view = webView
        if (view != null && view.canGoBack()) {
            view.goBack()
        } else {
            onCancel()
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = {
                val view = webView
                if (view != null && view.canGoBack()) view.goBack() else onCancel()
            }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = HubColors.Text)
            }
            Column(Modifier.weight(1f)) {
                Text("Sign in to D2L", color = HubColors.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    baseUrl.replaceFirst("https://", "").replaceFirst("http://", ""),
                    color = HubColors.Faint,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TextButton(onClick = onCancel) {
                Text("Cancel", color = HubColors.Muted, fontSize = 13.sp)
            }
        }

        if (progress < 100) {
            LinearProgressIndicator(
                color = HubColors.Violet,
                trackColor = HubColors.SurfaceAlt,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        AndroidView(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.loadWithOverviewMode = true
                    settings.useWideViewPort = true
                    settings.userAgentString = D2lClient.USER_AGENT
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                            progress = 5
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            progress = 100
                            checkSession()
                        }
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView, newProgress: Int) {
                            progress = newProgress
                        }
                    }

                    loadUrl(baseUrl.trimEnd('/') + "/d2l/home")
                    webView = this
                }
            },
        )

        Text(
            "Your password goes to your school, never to this app.",
            color = HubColors.Faint,
            fontSize = 11.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}
