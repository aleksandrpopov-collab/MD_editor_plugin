plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.22"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.mdeditor"
version = "1.0.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2023.2.5")
        instrumentationTools()
    }
}

intellijPlatform {
    // Java form / @NotNull bytecode instrumentation is unnecessary for this
    // Kotlin-only plugin and fails on some JDKs; disable it.
    instrumentCode = false

    pluginConfiguration {
        name = "MD|ed"
        ideaVersion {
            sinceBuild = "232"
            untilBuild = "262.*"
        }
    }
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }
}

val npmInstall = tasks.register<Exec>("npmInstall") {
    workingDir = file("webview")
    commandLine("npm", "install")
}

val buildWebview = tasks.register<Exec>("buildWebview") {
    dependsOn(npmInstall)
    workingDir = file("webview")
    commandLine("npm", "run", "build")
}

tasks.named<ProcessResources>("processResources") {
    dependsOn(buildWebview)
    from("webview/dist") {
        into("webview")
    }
}
