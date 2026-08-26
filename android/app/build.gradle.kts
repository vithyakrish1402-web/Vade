plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

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
            val storeFilePath = System.getenv("VADE_RELEASE_KEYSTORE_PATH") ?: (project.findProperty("VADE_RELEASE_STORE_FILE") as? String)
            val storePasswordVal = System.getenv("VADE_RELEASE_KEYSTORE_PASSWORD") ?: (project.findProperty("VADE_RELEASE_STORE_PASSWORD") as? String)
            val keyAliasVal = System.getenv("VADE_RELEASE_KEY_ALIAS") ?: (project.findProperty("VADE_RELEASE_KEY_ALIAS") as? String)
            val keyPasswordVal = System.getenv("VADE_RELEASE_KEY_PASSWORD") ?: (project.findProperty("VADE_RELEASE_KEY_PASSWORD") as? String)

            if (!storeFilePath.isNullOrBlank() && !storePasswordVal.isNullOrBlank() && !keyAliasVal.isNullOrBlank() && !keyPasswordVal.isNullOrBlank()) {
                storeFile = file(storeFilePath)
                storePassword = storePasswordVal
                keyAlias = keyAliasVal
                keyPassword = keyPasswordVal
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
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile != null && releaseSigning.storeFile!!.exists()) {
                signingConfig = releaseSigning
            } else {
                // Fallback for CI/development release testing when external keystore is unprovided
                signingConfig = signingConfigs.getByName("debug")
            }
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
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
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.11"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
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
