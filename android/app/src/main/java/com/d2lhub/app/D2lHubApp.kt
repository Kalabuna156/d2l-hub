package com.d2lhub.app

import android.app.Application
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader

class D2lHubApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // PdfBox needs its bundled fonts and resources unpacked before the
        // first document is opened.
        PDFBoxResourceLoader.init(this)
    }
}
