package com.d2lhub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.AiProvider

@Composable
fun AiSettingsDialog(viewModel: AppViewModel, onDismiss: () -> Unit) {
    val saved = viewModel.aiSettings
    var provider by remember { mutableStateOf(saved.provider) }
    var apiKey by remember { mutableStateOf("") }
    var model by remember { mutableStateOf(saved.model) }
    var baseUrl by remember { mutableStateOf(saved.customBaseUrl) }

    AlertDialog(
        onDismissRequest = { if (!viewModel.aiBusy) onDismiss() },
        containerColor = HubColors.SurfaceAlt,
        title = { Text("AI for outlines", color = HubColors.Text) },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 430.dp).verticalScroll(rememberScrollState()),
            ) {
                Text(
                    "Optional. Your own key lets the app read messy tables and unusual layouts when the basic date reader misses things. The outline text is sent to the provider you pick, using your credits.",
                    color = HubColors.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 19.sp,
                )
                Spacer(Modifier.height(14.dp))

                Text(
                    "PROVIDER",
                    color = HubColors.Faint,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp,
                )
                Spacer(Modifier.height(6.dp))
                for (option in AiProvider.entries) {
                    ProviderRow(
                        label = option.label,
                        selected = provider == option,
                        onClick = { provider = option },
                    )
                }

                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = { Text("API key", fontSize = 11.sp) },
                    placeholder = {
                        Text(
                            if (saved.hasKey) "Saved ${saved.keyHint} — leave blank to keep it" else "Paste your API key",
                            color = HubColors.Faint,
                            fontSize = 11.5.sp,
                        )
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Next,
                    ),
                    colors = aiFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = model,
                    onValueChange = { model = it },
                    label = { Text("Model (optional)", fontSize = 11.sp) },
                    placeholder = { Text(provider.defaultModel, color = HubColors.Faint, fontSize = 11.5.sp) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    colors = aiFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (provider == AiProvider.CUSTOM) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it },
                        label = { Text("Endpoint URL", fontSize = 11.sp) },
                        placeholder = { Text("https://host/v1", color = HubColors.Faint, fontSize = 11.5.sp) },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Done,
                        ),
                        colors = aiFieldColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Spacer(Modifier.height(10.dp))
                Text(
                    "If a model is busy, retired or rate-limited, the app tries the other models your key can use before giving up.",
                    color = HubColors.Faint,
                    fontSize = 10.5.sp,
                    lineHeight = 15.sp,
                )

                if (viewModel.aiNotice != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        viewModel.aiNotice!!,
                        color = HubColors.Green,
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp,
                    )
                }
                if (viewModel.aiError != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        viewModel.aiError!!,
                        color = HubColors.Rose,
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp,
                    )
                }

                if (saved.hasKey) {
                    Spacer(Modifier.height(6.dp))
                    TextButton(
                        onClick = { viewModel.forgetAiKey() },
                        enabled = !viewModel.aiBusy,
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                    ) {
                        Text("Remove saved key", color = HubColors.Rose, fontSize = 11.5.sp)
                    }
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(
                    onClick = {
                        viewModel.saveAiSettings(provider, apiKey, model, baseUrl)
                        if (viewModel.aiError == null) viewModel.testAi()
                    },
                    enabled = !viewModel.aiBusy,
                ) {
                    Text("Save & test", color = HubColors.VioletLight, fontSize = 12.5.sp)
                }
                Button(
                    onClick = {
                        viewModel.saveAiSettings(provider, apiKey, model, baseUrl)
                    },
                    enabled = !viewModel.aiBusy,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HubColors.Violet,
                        contentColor = Color.White,
                        disabledContainerColor = HubColors.Violet.copy(alpha = 0.3f),
                        disabledContentColor = Color.White.copy(alpha = 0.5f),
                    ),
                ) {
                    if (viewModel.aiBusy) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                    } else {
                        Text("Save")
                    }
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !viewModel.aiBusy) {
                Text("Close", color = HubColors.Muted)
            }
        },
    )
}

@Composable
private fun ProviderRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
            .padding(vertical = 7.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier
                .size(16.dp)
                .clip(CircleShape)
                .background(if (selected) HubColors.Violet else HubColors.Surface),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (selected) {
                Column(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(Color.White),
                ) {}
            }
        }
        Spacer(Modifier.size(10.dp))
        Text(
            label,
            color = if (selected) HubColors.Text else HubColors.Muted,
            fontSize = 12.5.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
        )
    }
}

@Composable
private fun aiFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = HubColors.Violet,
    unfocusedBorderColor = HubColors.Border,
    focusedContainerColor = HubColors.Surface,
    unfocusedContainerColor = HubColors.Surface,
    cursorColor = HubColors.VioletLight,
    focusedTextColor = HubColors.Text,
    unfocusedTextColor = HubColors.Text,
)
