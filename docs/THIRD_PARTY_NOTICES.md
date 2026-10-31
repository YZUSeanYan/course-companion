# Third-party notices

## Additional learning dependencies

- AndroidLiquidGlass / Kyant0 backdrop, Apache License 2.0. See `licenses/android-liquid-glass-LICENSE`.
- PdfBox-Android, Apache License 2.0. See `licenses/pdfbox-android-LICENSE` and `licenses/pdfbox-android-NOTICE`. JPEG2000 image decoding is not used by the current text importer.
- open-spaced-repetition/java-fsrs, MIT License. See `licenses/java-fsrs-LICENSE`.
- OkHttp and kotlinx.serialization, Apache License 2.0. Upstream license texts must accompany any distributed build.
- AndroidX, Kotlin and desugar_jdk_libs, Apache License 2.0 or their respective upstream terms.
- Google ML Kit Text Recognition is a proprietary Google SDK, not an open-source library. Its SDK terms apply separately.

## sherpa-onnx v1.13.4

The packaged Android JNI runtime and Kotlin bindings are from
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), copyright its
contributors, and are licensed under Apache License 2.0. A copy of the
applicable license must accompany any released build.

## Offline inference models

Release builds do not bundle model weights. The app can download these official model packages from the configured mirror or official upstream source:

- `sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01` for responsive partial transcription.
- `sherpa-onnx-paraformer-zh-small-2024-03-09` for final transcription.
- `silero_vad.onnx` for local voice activity detection.

Local debug and instrumentation builds may contain copies of these weights for development only; those files are excluded from this repository. The weights are independent artifacts with their own upstream terms. Before any public or commercial distribution, record the exact source URLs, SHA-256 hashes, and each model's redistribution licence, then remove or replace any asset whose terms do not permit the intended distribution.
