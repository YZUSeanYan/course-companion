# Instrumentation test assets

These two WAV files are small synthetic classroom-style samples generated for tests; they are not recordings of a real teacher or student:

- `english-classroom.wav`
- `chinese-classroom.wav`

Large offline model files are intentionally not committed. To run native ASR or model-manager tests locally, place verified fixtures under:

```text
model-fixtures/
  first_pass/model.int8.onnx
  first_pass/tokens.txt
  first_pass/bbpe.model
  second_pass/model.int8.onnx
  second_pass/tokens.txt
  vad/silero_vad.onnx
```

Tests that need missing fixtures skip with an explicit message. Never replace these fixtures with real classroom recordings or other people's voice data.
