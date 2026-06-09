package com.mdeditor

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.fileEditor.impl.text.TextEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

class MDEdEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile): Boolean {
        return file.extension?.lowercase() == "md"
    }

    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        // Combine the raw Markdown text editor with the MD|ed WYSIWYG view so the
        // IDE renders a native top-right Editor / Split / Preview toggle (instead
        // of the provider-switch tabs that used to sit at the bottom).
        val textEditor = TextEditorProvider.getInstance().createEditor(project, file) as TextEditor
        val mdedEditor = MDEdFileEditor(project, file)
        return TextEditorWithPreview(
            textEditor,
            mdedEditor,
            "MD|ed",
            // Default to the WYSIWYG view; the toggle reveals the source/split.
            TextEditorWithPreview.Layout.SHOW_PREVIEW,
        )
    }

    override fun getEditorTypeId(): String = "mdeditor.interactive"

    // We embed the platform text editor ourselves AND want to be the sole editor
    // for .md files, so hide every other provider (the platform text editor and
    // the bundled Markdown plugin's split editor). This removes the bottom
    // provider-switch toggle ("Markdown Split Editor" / "MD|ed"); only our own
    // top-right Editor/Split/Preview toggle remains.
    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_OTHER_EDITORS
}
