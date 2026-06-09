package com.mdeditor

import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.Alarm
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class MDEdFileEditor(private val project: Project, private val file: VirtualFile) : FileEditor {

    private val browser: JBCefBrowser = JBCefBrowser()
    private val jsQuery: JBCefJSQuery = JBCefJSQuery.create(browser)

    private val document = FileDocumentManager.getInstance().getDocument(file)

    // True while we are writing the document from a web-side edit. The document
    // listener checks this to skip echoing our own change back to the web view
    // (which would otherwise create a save<->update loop).
    @Volatile
    private var applyingFromWeb = false

    // Coalesces source-side edits before pushing them to the (slower) web view.
    private val pushAlarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, this)

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
            try {
                val json = JsonParser.parseString(request).asJsonObject
                when (json.get("action")?.asString) {
                    // Forward sync: persist the WYSIWYG markdown into the document.
                    "saveDocument" -> {
                        val md = json.getAsJsonObject("payload").get("markdown").asString
                        writeMarkdownToDocument(md)
                    }
                    // "registerCommand" and any future actions: acknowledged below.
                }
                JBCefJSQuery.Response("OK")
            } catch (e: Exception) {
                JBCefJSQuery.Response(null, 1, e.message ?: "Bad request")
            }
        }

        // Reverse sync: source/Split edits flow back into the WYSIWYG view.
        document?.addDocumentListener(object : DocumentListener {
            override fun documentChanged(event: DocumentEvent) {
                if (applyingFromWeb) return
                schedulePushToWeb()
            }
        }, this)

        browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadEnd(cefBrowser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                // Inject the cefQuery function
                val injectScript = """
                    window.cefQuery = function(request) {
                        ${"$"}{jsQuery.inject("request.request", "request.onSuccess", "request.onFailure")}
                    };
                """.trimIndent()
                cefBrowser.executeJavaScript(injectScript, cefBrowser.url, 0)
                
                // Initialize content. Prefer the in-memory Document (may hold
                // unsaved edits) over the on-disk bytes. JSON-encode the string so
                // quotes/newlines/backslashes can't break the injected JS literal.
                val content = document?.text ?: String(file.contentsToByteArray(), Charsets.UTF_8)
                val markdownJson = JsonPrimitive(content).toString()

                val initScript = """
                    setTimeout(() => {
                        if (window.MDEdBridge && window.MDEdBridge.initDocument) {
                            window.MDEdBridge.initDocument({
                                markdown: $markdownJson,
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

    /**
     * Forward sync (MD|ed -> file). Runs on the EDT under a write command so it
     * participates in IDE undo. `applyingFromWeb` suppresses the document
     * listener while we write, so this edit is not echoed back to the web view.
     */
    private fun writeMarkdownToDocument(markdown: String) {
        val doc = document ?: return
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed || doc.text == markdown) return@invokeLater
            applyingFromWeb = true
            try {
                WriteCommandAction.runWriteCommandAction(project) { doc.setText(markdown) }
            } finally {
                applyingFromWeb = false
            }
        }
    }

    /** Debounce source-side edits before pushing them to the web view. */
    private fun schedulePushToWeb() {
        pushAlarm.cancelAllRequests()
        pushAlarm.addRequest({ pushContentToWeb() }, 200)
    }

    /** Reverse sync (file/Document -> MD|ed). */
    private fun pushContentToWeb() {
        val doc = document ?: return
        val markdownJson = JsonPrimitive(doc.text).toString()
        val js = "if (window.MDEdBridge && window.MDEdBridge.updateContent) { " +
            "window.MDEdBridge.updateContent({ markdown: $markdownJson }); }"
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
