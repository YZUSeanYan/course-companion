# The sherpa-onnx public API is called directly from Kotlin, but its model config is
# traversed from JNI. Keep the API surface while allowing unused app code/resources to
# be removed from the release build.
-keep class com.k2fsa.sherpa.onnx.** { *; }
-keep class androidx.room.RoomDatabase { *; }

# The importer handles PDF text layers only. JPEG2000 image decoding is optional
# in PdfBox-Android and is not used by this feature.
-dontwarn com.gemalto.jp2.JP2Decoder
