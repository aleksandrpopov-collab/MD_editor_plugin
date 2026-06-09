package com.mdeditor

import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefCallback
import org.cef.callback.CefSchemeHandlerFactory
import org.cef.handler.CefResourceHandler
import org.cef.misc.IntRef
import org.cef.misc.StringRef
import org.cef.network.CefRequest
import org.cef.network.CefResponse
import java.net.URI

/**
 * Serves the bundled web UI (`webview/dist`, copied into plugin resources under
 * `/webview`) over a virtual `http://mded/` origin so the plugin is fully
 * self-contained — no dev server required. An http origin (rather than file://)
 * is mandatory because the Vite build loads its JS as `<script type="module">`,
 * which Chromium refuses to fetch from a `file://` origin.
 */
const val MDED_APP_URL: String = "http://mded/index.html"
const val MDED_SCHEME: String = "http"
const val MDED_DOMAIN: String = "mded"

class MDEdSchemeHandlerFactory : CefSchemeHandlerFactory {
    override fun create(
        browser: CefBrowser?,
        frame: CefFrame?,
        schemeName: String?,
        request: CefRequest?,
    ): CefResourceHandler = MDEdResourceHandler()
}

private class MDEdResourceHandler : CefResourceHandler {
    private var data: ByteArray? = null
    private var mime: String = "application/octet-stream"
    private var offset: Int = 0

    override fun processRequest(request: CefRequest, callback: CefCallback): Boolean {
        // Map the request path onto a bundled resource: http://mded/assets/x.js
        // -> classpath /webview/assets/x.js. "/" and empty fall back to index.
        var path = runCatching { URI(request.url).path }.getOrNull().orEmpty()
        if (path.isEmpty() || path == "/") path = "/index.html"

        data = javaClass.getResourceAsStream("/webview$path")?.use { it.readBytes() }
        mime = mimeFor(path)
        callback.Continue()
        return true
    }

    override fun getResponseHeaders(response: CefResponse, responseLength: IntRef, redirectUrl: StringRef) {
        val bytes = data
        response.mimeType = mime
        // Same-origin in practice, but the module scripts carry `crossorigin`;
        // an explicit ACAO keeps the CORS check happy.
        response.setHeaderByName("Access-Control-Allow-Origin", "*", true)
        response.status = if (bytes != null) 200 else 404
        responseLength.set(bytes?.size ?: 0)
    }

    override fun readResponse(
        dataOut: ByteArray,
        bytesToRead: Int,
        bytesRead: IntRef,
        callback: CefCallback,
    ): Boolean {
        val bytes = data
        if (bytes == null || offset >= bytes.size) {
            bytesRead.set(0)
            return false
        }
        val toCopy = minOf(bytesToRead, bytes.size - offset)
        System.arraycopy(bytes, offset, dataOut, 0, toCopy)
        offset += toCopy
        bytesRead.set(toCopy)
        return true
    }

    override fun cancel() {
        data = null
    }

    private fun mimeFor(path: String): String = when {
        path.endsWith(".html") -> "text/html"
        path.endsWith(".js") || path.endsWith(".mjs") -> "text/javascript"
        path.endsWith(".css") -> "text/css"
        path.endsWith(".svg") -> "image/svg+xml"
        path.endsWith(".json") || path.endsWith(".map") -> "application/json"
        path.endsWith(".woff2") -> "font/woff2"
        path.endsWith(".woff") -> "font/woff"
        path.endsWith(".ttf") -> "font/ttf"
        path.endsWith(".png") -> "image/png"
        path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
        path.endsWith(".gif") -> "image/gif"
        else -> "application/octet-stream"
    }
}
