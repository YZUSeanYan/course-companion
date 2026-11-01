plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
    id("androidx.room")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    val configuredLearningApiUrl = providers.gradleProperty("LEARNING_API_BASE_URL")
    namespace = "com.classroomradar.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "store.seanyan.coursecompanion"
        minSdk = 29
        targetSdk = 36
        versionCode = 6
        versionName = "2.0.4"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "LEARNING_API_BASE_URL", "\"${configuredLearningApiUrl.orElse("http://10.0.2.2:8765").get()}\"")
        ndk {
            // The bundled offline models already dominate the package. Restricting the
            // native runtime to modern 64-bit Android removes three duplicate ORT/JNI
            // binaries without changing recognition quality on supported devices.
            abiFilters += "arm64-v8a"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            buildConfigField("String", "LEARNING_API_BASE_URL", "\"${configuredLearningApiUrl.orElse("https://course-companion.invalid").get()}\"")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        noCompress += setOf("onnx", "model")
    }

    room {
        schemaDirectory("$projectDir/schemas")
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    // AndroidLiquidGlass (Kyant0 backdrop) implements the real liquid-glass renderer.
    // It is pure Compose/AGSL (no native .so), so the arm64-only abiFilters above
    // already satisfy the 64-bit-only packaging requirement. 2.0.0 is compiled against
    // API 37 and would force a compileSdk/AGP upgrade, so use 1.0.6 - same renderer
    // generation that still supports compileSdk 36.
    implementation("io.github.kyant0:backdrop:1.0.6")
    // backdrop 1.0.6 is built against compose-ui 1.10; BOM 2026.06.01 maps ui 1.11.4,
    // the newest BOM still compatible with compileSdk 36 / AGP 9.0.1.
    val composeBom = platform("androidx.compose:compose-bom:2026.06.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.tom-roush:pdfbox-android:2.0.27.0")
    implementation("com.google.mlkit:text-recognition-chinese:16.0.1")
    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.room:room-ktx:2.8.4")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")
    implementation("io.github.open-spaced-repetition:fsrs:1.0.0")
    implementation("org.apache.commons:commons-compress:1.27.1")
    compileOnly("org.projectlombok:lombok:1.18.48")
    ksp("androidx.room:room-compiler:2.8.4")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    androidTestImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.room:room-testing:2.8.4")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}
