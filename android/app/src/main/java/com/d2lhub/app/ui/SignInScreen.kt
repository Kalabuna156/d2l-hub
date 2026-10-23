package com.d2lhub.app.ui

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

fun normalizeBaseUrl(raw: String): String? {
    var value = raw.trim()
    if (value.isEmpty()) return null
    if (!value.startsWith("http://") && !value.startsWith("https://")) value = "https://$value"
    val uri = Uri.parse(value)
    val host = uri.host ?: return null
    if (host.isBlank()) return null
    val scheme = uri.scheme ?: "https"
    val port = if (uri.port > 0) ":${uri.port}" else ""
    return "$scheme://$host$port"
}

@Composable
fun SignInScreen(initialBaseUrl: String?, onSignedIn: (baseUrl: String, cookie: String) -> Unit) {
    var baseUrl by remember { mutableStateOf(initialBaseUrl.orEmpty()) }
    var activeUrl by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    val current = activeUrl
    if (current != null) {
        SignInWebView(
            baseUrl = current,
            onSignedIn = onSignedIn,
            onCancel = { activeUrl = null },
        )
        return
    }

    val connect = {
        val normalized = normalizeBaseUrl(baseUrl)
        if (normalized == null) {
            error = "Enter your school's D2L address, like courses.torontomu.ca"
        } else {
            error = null
            activeUrl = normalized
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            color = HubColors.Violet,
            shape = CircleShape,
            modifier = Modifier.size(64.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("D2L", color = androidx.compose.ui.graphics.Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(24.dp))
        Text(
            "Welcome to D2L Hub",
            color = HubColors.Text,
            fontSize = 26.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Your courses, due dates and announcements in one dark dashboard.",
            color = HubColors.Muted,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            lineHeight = 21.sp,
        )

        Spacer(Modifier.height(32.dp))
        Surface(
            color = HubColors.Surface,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(20.dp)) {
                Text(
                    "D2L ADDRESS",
                    color = HubColors.Faint,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.2.sp,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = baseUrl,
                    onValueChange = { baseUrl = it },
                    placeholder = { Text("courses.torontomu.ca", color = HubColors.Faint) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Go,
                    ),
                    keyboardActions = KeyboardActions(onGo = { connect() }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = HubColors.Violet,
                        unfocusedBorderColor = HubColors.Border,
                        focusedContainerColor = HubColors.SurfaceAlt,
                        unfocusedContainerColor = HubColors.SurfaceAlt,
                        cursorColor = HubColors.VioletLight,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (error != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(error!!, color = HubColors.Rose, fontSize = 12.sp, lineHeight = 17.sp)
                }

                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = connect,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HubColors.Violet,
                        contentColor = androidx.compose.ui.graphics.Color.White,
                    ),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    Text("Open D2L sign-in", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }

                Spacer(Modifier.height(16.dp))
                Text(
                    "Sign in on your school's own page. D2L Hub never sees your password — it keeps only the session cookie on this phone, encrypted.",
                    color = HubColors.Faint,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.Center) {
            Text(
                "Unofficial client · not affiliated with D2L or your school",
                color = HubColors.Faint,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
