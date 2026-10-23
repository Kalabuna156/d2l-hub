package com.d2lhub.app.ui

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.data.SavedFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.Closeable
import java.io.File
import kotlin.math.roundToInt

/**
 * A PDF opened from Content Space. Pages sit in one continuous list, so
 * swiping scrolls into the next page instead of tapping through them.
 */
@Composable
fun PdfViewerScreen(file: SavedFile, path: File, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val context = LocalContext.current
    var loader by remember(file.id) { mutableStateOf<PdfPageLoader?>(null) }
    var pageCount by remember(file.id) { mutableIntStateOf(0) }
    var error by remember(file.id) { mutableStateOf<String?>(null) }
    var currentPage by remember(file.id) { mutableIntStateOf(1) }
    val cache = remember(file.id) { PdfPageCache() }
    val listState = rememberLazyListState()
    val horizontal = rememberScrollState()
    val scope = rememberCoroutineScope()
    val prefs = remember {
        context.getSharedPreferences("d2lhub", android.content.Context.MODE_PRIVATE)
    }
    var invert by remember { mutableStateOf(prefs.getBoolean("pdfInvert", false)) }
    var zoom by remember(file.id) { mutableStateOf(1f) }

    DisposableEffect(file.id) {
        onDispose {
            loader?.close()
            cache.clear()
        }
    }

    LaunchedEffect(file.id) {
        val result = withContext(Dispatchers.IO) {
            runCatching { PdfPageLoader(path) }
        }
        result.onSuccess { opened ->
            if (opened.pageCount <= 0) {
                opened.close()
                error = "This PDF has no pages."
            } else {
                loader = opened
                pageCount = opened.pageCount
            }
        }.onFailure {
            error = if (it is SecurityException) {
                "This PDF is password protected. Open it in a document app instead."
            } else {
                "This PDF could not be opened. It may be damaged or not a PDF."
            }
        }
    }

    LaunchedEffect(pageCount) {
        if (pageCount <= 0) return@LaunchedEffect
        snapshotFlow { listState.firstVisibleItemIndex }.collect { index ->
            currentPage = (index + 1).coerceAtMost(pageCount)
        }
    }

    Column(Modifier.fillMaxSize().background(HubColors.Background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Close PDF",
                    tint = HubColors.Text,
                )
            }
            Column(Modifier.weight(1f)) {
                Text(
                    file.title,
                    color = HubColors.Text,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    listOfNotNull(file.courseName.ifBlank { null }, file.fileName)
                        .joinToString(" · "),
                    color = HubColors.Faint,
                    fontSize = 10.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (pageCount > 0) {
                Text(
                    "$currentPage / $pageCount",
                    color = HubColors.Muted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(HubColors.Surface)
                        .padding(horizontal = 9.dp, vertical = 5.dp),
                )
            }
        }

        if (pageCount > 0) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    "${(zoom * 100).roundToInt()}%",
                    color = HubColors.Faint,
                    fontSize = 10.5.sp,
                    modifier = Modifier.width(34.dp),
                )
                ToolChip("−", enabled = zoom > ZOOM_STEPS.first()) {
                    zoom = steppedZoom(zoom, -1)
                }
                ToolChip("+", enabled = zoom < ZOOM_STEPS.last()) {
                    zoom = steppedZoom(zoom, 1)
                }
                if (zoom > ZOOM_STEPS.first()) {
                    ToolChip("Fit") {
                        zoom = ZOOM_STEPS.first()
                        scope.launch { horizontal.scrollTo(0) }
                    }
                }
                Spacer(Modifier.weight(1f))
                ToolChip(
                    label = "Invert",
                    active = invert,
                    onClick = {
                        invert = !invert
                        prefs.edit().putBoolean("pdfInvert", invert).apply()
                    },
                )
            }
        }

        val failure = error
        val ready = loader
        when {
            failure != null -> PdfError(failure, onRetry = {
                error = null
                loader = null
                pageCount = 0
            }, onOpenExternally = {
                openSavedFile(context, file, path)?.let {
                    Toast.makeText(context, it, Toast.LENGTH_LONG).show()
                }
            })

            ready == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = HubColors.Violet)
                    Spacer(Modifier.height(10.dp))
                    Text("Opening PDF…", color = HubColors.Faint, fontSize = 12.sp)
                }
            }

            else -> BoxWithConstraints(Modifier.fillMaxSize()) {
                val pageWidth = maxWidth * zoom
                // Render a little wider than the page is drawn so text stays
                // crisp; the cap keeps a zoomed page from eating the heap.
                val widthPx = with(LocalDensity.current) {
                    (pageWidth - 24.dp).toPx() * 1.15f
                }.toInt().coerceIn(320, 1600)

                LaunchedEffect(widthPx) {
                    // Cached pages were rendered for a different zoom.
                    cache.clear()
                }

                Box(Modifier.fillMaxSize().horizontalScroll(horizontal)) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.width(pageWidth).fillMaxHeight(),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        items(pageCount) { index ->
                            PdfPage(
                                loader = ready,
                                index = index,
                                widthPx = widthPx,
                                pageCount = pageCount,
                                cache = cache,
                                invert = invert,
                            )
                        }
                        item {
                            Text(
                                "End of document",
                                color = HubColors.Faint,
                                fontSize = 11.sp,
                                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            )
                        }
                    }
                }
            }
        }
    }
}

private val ZOOM_STEPS = listOf(1f, 1.25f, 1.5f, 1.75f, 2f)

private fun steppedZoom(current: Float, direction: Int): Float {
    val index = ZOOM_STEPS.indexOfFirst { it >= current - 0.001f }.coerceAtLeast(0)
    return ZOOM_STEPS[(index + direction).coerceIn(0, ZOOM_STEPS.lastIndex)]
}

/** White paper becomes black, black text becomes white. */
private val InvertColors: ColorFilter = ColorFilter.colorMatrix(
    ColorMatrix(
        floatArrayOf(
            -1f, 0f, 0f, 0f, 255f,
            0f, -1f, 0f, 0f, 255f,
            0f, 0f, -1f, 0f, 255f,
            0f, 0f, 0f, 1f, 0f,
        ),
    ),
)

@Composable
private fun ToolChip(
    label: String,
    active: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Text(
        label,
        color = when {
            !enabled -> HubColors.Faint.copy(alpha = 0.45f)
            active -> HubColors.VioletLight
            else -> HubColors.Muted
        },
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (active) HubColors.Violet.copy(alpha = 0.18f) else HubColors.Surface)
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 9.dp, vertical = 5.dp),
    )
}

@Composable
private fun PdfPage(
    loader: PdfPageLoader,
    index: Int,
    widthPx: Int,
    pageCount: Int,
    cache: PdfPageCache,
    invert: Boolean,
) {
    var bitmap by remember(index, widthPx) { mutableStateOf<Bitmap?>(null) }
    var failed by remember(index, widthPx) { mutableStateOf(false) }

    LaunchedEffect(index, widthPx) {
        cache.get(index)?.let {
            bitmap = it
            return@LaunchedEffect
        }
        val result = runCatching { loader.render(index, widthPx) }
        result.onSuccess {
            cache.put(index, it)
            bitmap = it
        }.onFailure {
            failed = true
        }
    }

    Column(Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(5.dp))
                .background(HubColors.SurfaceAlt),
            contentAlignment = Alignment.Center,
        ) {
            val image = bitmap
            when {
                image != null -> Image(
                    bitmap = image.asImageBitmap(),
                    contentDescription = "Page ${index + 1}",
                    contentScale = ContentScale.FillWidth,
                    colorFilter = if (invert) InvertColors else null,
                    modifier = Modifier.fillMaxWidth(),
                )

                failed -> Text(
                    "Page ${index + 1} could not be drawn",
                    color = HubColors.Rose,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(vertical = 40.dp),
                )

                else -> CircularProgressIndicator(
                    color = HubColors.Violet,
                    strokeWidth = 2.dp,
                    modifier = Modifier.padding(vertical = 60.dp).size(18.dp),
                )
            }
        }
        Spacer(Modifier.height(5.dp))
        Text(
            "Page ${index + 1} of $pageCount",
            color = HubColors.Faint,
            fontSize = 10.sp,
            modifier = Modifier.fillMaxWidth(),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

@Composable
private fun PdfError(
    message: String,
    onRetry: () -> Unit,
    onOpenExternally: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "PDF viewer unavailable",
            color = HubColors.Text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            message,
            color = HubColors.Faint,
            fontSize = 12.sp,
            lineHeight = 18.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))
        TextButton(onClick = onRetry) {
            Text("Try again", color = HubColors.VioletLight, fontSize = 12.sp)
        }
        TextButton(onClick = onOpenExternally) {
            Text("Open with another app", color = HubColors.VioletLight, fontSize = 12.sp)
        }
    }
}

/** Renders pages on demand; a single renderer cannot be used from two threads. */
private class PdfPageLoader(path: File) : Closeable {
    private val descriptor =
        ParcelFileDescriptor.open(path, ParcelFileDescriptor.MODE_READ_ONLY)
    private val renderer = PdfRenderer(descriptor)
    private val mutex = Mutex()

    val pageCount: Int = renderer.pageCount

    suspend fun render(index: Int, widthPx: Int): Bitmap = mutex.withLock {
        withContext(Dispatchers.IO) {
            renderer.openPage(index).use { page ->
                if (page.width <= 0 || page.height <= 0) {
                    throw IllegalStateException("That PDF page is empty.")
                }
                val width = widthPx.coerceIn(320, 1600)
                val height = (page.height.toFloat() * width / page.width)
                    .toInt()
                    .coerceIn(1, 6000)
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                // PdfRenderer leaves untouched pixels transparent.
                bitmap.eraseColor(android.graphics.Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                bitmap
            }
        }
    }

    override fun close() {
        runCatching { renderer.close() }
        runCatching { descriptor.close() }
    }
}

/** A few pages stay decoded so scrolling back up does not redraw them. */
private class PdfPageCache(private val max: Int = 3) {
    private val pages = object : LinkedHashMap<Int, Bitmap>(8, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Bitmap>): Boolean =
            size > max
    }

    fun get(index: Int): Bitmap? = synchronized(pages) { pages[index] }

    fun put(index: Int, bitmap: Bitmap) {
        synchronized(pages) { pages[index] = bitmap }
    }

    fun clear() {
        synchronized(pages) { pages.clear() }
    }
}
