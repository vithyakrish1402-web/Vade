plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// ==============================================================================
// Release signing inputs
//
// Supplied via environment variables or Gradle properties — put them in
// ~/.gradle/gradle.properties or CI secrets, NEVER in this repo. Both the
// KEYSTORE_* names and the legacy STORE_* property names are accepted, since
// the two used to disagree and a mismatch silently produced a debug-signed build.
// ==============================================================================
fun signingValue(vararg names: String): String? {
    for (name in names) {
        val value = System.getenv(name) ?: project.findProperty(name) as? String
        if (!value.isNullOrBlank()) return value
    }
    return null
}

val releaseStorePath = signingValue("VADE_RELEASE_KEYSTORE_PATH", "VADE_RELEASE_STORE_FILE")
val releaseStorePassword = signingValue("VADE_RELEASE_KEYSTORE_PASSWORD", "VADE_RELEASE_STORE_PASSWORD")
val releaseKeyAliasValue = signingValue("VADE_RELEASE_KEY_ALIAS")
val releaseKeyPasswordValue = signingValue("VADE_RELEASE_KEY_PASSWORD")

val missingSigningVars = listOf(
    "VADE_RELEASE_KEYSTORE_PATH" to releaseStorePath,
    "VADE_RELEASE_KEYSTORE_PASSWORD" to releaseStorePassword,
    "VADE_RELEASE_KEY_ALIAS" to releaseKeyAliasValue,
    "VADE_RELEASE_KEY_PASSWORD" to releaseKeyPasswordValue
).filter { it.second == null }.map { it.first }

val releaseKeystoreFile = releaseStorePath?.let { file(it) }
val releaseSigningComplete = missingSigningVars.isEmpty()
val releaseKeystoreExists = releaseKeystoreFile?.exists() == true

// Only a complete config pointing at a keystore that actually exists counts as usable.
// Anything less must fail the build rather than quietly degrade to the debug key.
val releaseSigningUsable = releaseSigningComplete && releaseKeystoreExists
val allowInsecureReleaseSigning =
    (signingValue("VADE_ALLOW_INSECURE_RELEASE_SIGNING") ?: "false").toBoolean()

android {
    // Must match the actual Kotlin source package ("package com.enctxt" in every .kt file),
    // NOT applicationId below — this is only used to resolve the manifest's relative class
    // names (".EnctxtApplication", ".MainActivity") and to generate the R class package.
    // Was previously "com.enctxt.app", which doesn't match any source file's package
    // declaration; the app crashed on launch with ClassNotFoundException for
    // com.enctxt.app.EnctxtApplication, since no such class exists.
    namespace = "com.enctxt"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.enctxt.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0-rc.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            if (releaseSigningUsable) {
                storeFile = releaseKeystoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAliasValue
                keyPassword = releaseKeyPasswordValue
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Real release keystore when one is properly configured. The debug fallback exists
            // ONLY so a non-distributable local/CI smoke build can run; the task-graph guard at
            // the bottom of this file hard-fails such a build unless it was explicitly opted
            // into via VADE_ALLOW_INSECURE_RELEASE_SIGNING.
            signingConfig = if (releaseSigningUsable) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }

            // Production backend (Render). Always HTTPS/WSS — cleartext is
            // disabled network-wide in network_security_config.xml regardless.
            buildConfigField("String", "API_BASE_URL", "\"https://vade-api.onrender.com/api\"")
            buildConfigField("String", "WS_URL", "\"wss://vade-api.onrender.com/ws\"")
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"

            // Local dev server via the emulator's host-loopback alias by default.
            // Override with -PVADE_DEV_API_BASE_URL / -PVADE_DEV_WS_URL (or the
            // matching env vars) to point a debug build at a remote/staging backend
            // without touching source.
            val devApiBaseUrl = System.getenv("VADE_DEV_API_BASE_URL")
                ?: (project.findProperty("VADE_DEV_API_BASE_URL") as? String)
                ?: "http://10.0.2.2:5000/api"
            val devWsUrl = System.getenv("VADE_DEV_WS_URL")
                ?: (project.findProperty("VADE_DEV_WS_URL") as? String)
                ?: "ws://10.0.2.2:5000/ws"
            buildConfigField("String", "API_BASE_URL", "\"$devApiBaseUrl\"")
            buildConfigField("String", "WS_URL", "\"$devWsUrl\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.11"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    sourceSets {
        // Expose the repo-wide cross-platform test vectors (single source of truth, shared with
        // the Web client's Vitest suite) on the JVM unit test classpath, rather than hand-copying
        // them into the module.
        getByName("test") {
            resources.srcDir("../../docs/test-vectors")
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    // Serialization & Networking
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    // Room Database
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // Cryptography & Keystore
    implementation(libs.androidx.security.crypto)
    implementation(libs.bouncycastle.prov)
    implementation(libs.bouncycastle.pkix)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.bouncycastle.prov)
    testImplementation(libs.bouncycastle.pkix)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}

// ==============================================================================
// Fail-closed release signing guard
//
// A release artifact must never be produced with the debug key unless that was
// explicitly and knowingly opted into. The debug keystore is shared and publicly
// known (password "android"), so a debug-signed "release" could be updated over
// by anyone who repackages the app — unacceptable for an E2EE messenger.
//
// This is enforced on the task graph rather than at configuration time so that
// unrelated work (assembleDebug, test, lint) still runs without release signing
// credentials present.
// ==============================================================================
// Matched by exact task path, never by prefix: intermediate tasks such as
// packageReleaseResources and bundleReleaseClassesToRuntimeJar are pulled in by plain
// `test` and produce no signed artifact, so a prefix match would break ordinary builds.
val releaseArtifactTasks = setOf(
    "assembleRelease",
    "bundleRelease",
    "packageRelease",
    "signReleaseBundle"
).map { "${project.path}:$it" }.toSet()
val buildLogger = logger

gradle.taskGraph.whenReady {
    val buildsReleaseArtifact = allTasks.any { it.path in releaseArtifactTasks }
    if (!buildsReleaseArtifact || releaseSigningUsable) return@whenReady

    val reason = when {
        !releaseSigningComplete && missingSigningVars.size == 4 ->
            "No release signing credentials were provided."
        !releaseSigningComplete ->
            "Release signing is only partially configured. Missing: ${missingSigningVars.joinToString(", ")}"
        else ->
            "Release keystore not found at: ${releaseKeystoreFile?.absolutePath}"
    }

    if (allowInsecureReleaseSigning) {
        buildLogger.warn(
            """
            ${"=".repeat(78)}
            WARNING: building a RELEASE artifact signed with the DEBUG key.
            $reason
            Proceeding only because VADE_ALLOW_INSECURE_RELEASE_SIGNING=true.
            This artifact is NOT distributable. Do not upload or share it.
            ${"=".repeat(78)}
            """.trimIndent()
        )
        return@whenReady
    }

    throw GradleException(
        """
        Release signing is not configured.

        $reason

        A release build must be signed with your own release keystore. Falling back to
        the debug key would produce an artifact anyone could forge an update for, since
        that key is shared and its password is publicly known.

        Provide these as environment variables or Gradle properties (use
        ~/.gradle/gradle.properties or CI secrets — never commit them):

          VADE_RELEASE_KEYSTORE_PATH      (legacy alias: VADE_RELEASE_STORE_FILE)
          VADE_RELEASE_KEYSTORE_PASSWORD  (legacy alias: VADE_RELEASE_STORE_PASSWORD)
          VADE_RELEASE_KEY_ALIAS
          VADE_RELEASE_KEY_PASSWORD

        For a local or CI smoke build where signing identity does not matter, you can
        opt in explicitly to debug-key signing:

          ./gradlew assembleRelease -PVADE_ALLOW_INSECURE_RELEASE_SIGNING=true

        Never distribute an artifact built with that flag.
        """.trimIndent()
    )
}
