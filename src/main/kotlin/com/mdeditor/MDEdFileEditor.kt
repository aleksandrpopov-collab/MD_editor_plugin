package com.mdeditor

import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class MDEdFileEditor(private val project: Project, private val file: VirtualFile) : FileEditor {

    private val browser: JBCefBrowser = JBCefBrowser()
    private val jsQuery: JBCefJSQuery = JBCefJSQuery.create(browser)

    init {
        // Self-contained by default: serve the bundled web UI over http://mded/.
        // For HMR-based development, pass -Dmded.devUrl=http://localhost:5173.
        val devUrl: String? = System.getProperty("mded.devUrl")
        if (devUrl == null) ensureSchemeHandler()
        browser.loadURL(devUrl ?: MDED_APP_URL)

        // Keep the web view in sync with the IDE's light/dark theme. We only
        // send a boolean; the web side owns the two fixed palettes.
        ApplicationManager.getApplication().messageBus.connect(this)
            .subscribe(LafManagerListener.TOPIC, LafManagerListener { pushTheme() })

        jsQuery.addHandler { request ->
            // Parse JSON request
            println("Received from JS: ${"$"}{request}")
            JBCefJSQuery.Response("OK")
        }

        browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadEnd(cefBrowser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                // Inject the cefQuery function
                val injectScript = """
                    window.cefQuery = function(request) {
                        ${"$"}{jsQuery.inject("request.request", "request.onSuccess", "request.onFailure")}
                    };
                """.trimIndent()
                cefBrowser.executeJavaScript(injectScript, cefBrowser.url, 0)
                
                // Initialize content
                val content = String(file.contentsToByteArray(), Charsets.UTF_8)
                val escapedContent = content.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
                
                val initScript = """
                    setTimeout(() => {
                        if (window.MDEdBridge && window.MDEdBridge.initDocument) {
                            window.MDEdBridge.initDocument({
                                markdown: "$escapedContent",
                                theme: { isDark: ${isDarkTheme()} }
                            });
                        }
                    }, 500);
                """.trimIndent()
                cefBrowser.executeJavaScript(initScript, cefBrowser.url, 0)
            }
        }, browser.cefBrowser)
    }

    /** IDE LAF brightness → simple dark/light flag for the web view. */
    private fun isDarkTheme(): Boolean = !JBColor.isBright()

    /** Push the current IDE theme to the web view on a live theme change. */
    private fun pushTheme() {
        val js = "if (window.MDEdBridge && window.MDEdBridge.updateTheme) { " +
            "window.MDEdBridge.updateTheme({ isDark: ${isDarkTheme()} }); }"
        browser.cefBrowser.executeJavaScript(js, browser.cefBrowser.url, 0)
    }

    override fun getComponent(): JComponent = browser.component

    override fun getPreferredFocusedComponent(): JComponent = browser.component

    override fun getName(): String = "MD|ed"

    override fun setState(state: FileEditorState) {}

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = true

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    override fun getCurrentLocation(): FileEditorLocation? = null

    override fun dispose() {
        jsQuery.dispose()
        browser.dispose()
    }
    
    override fun getFile(): VirtualFile = file
    
    override fun <T : Any?> getUserData(key: Key<T>): T? = null
    override fun <T : Any?> putUserData(key: Key<T>, value: T?) {}

    companion object {
        @Volatile
        private var schemeRegistered = false

        /** Register the bundled-resource handler once for the whole app. */
        @Synchronized
        private fun ensureSchemeHandler() {
            if (schemeRegistered) return
            CefApp.getInstance().registerSchemeHandlerFactory(
                MDED_SCHEME, MDED_DOMAIN, MDEdSchemeHandlerFactory(),
            )
            schemeRegistered = true
        }
    }
}
