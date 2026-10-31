Add-Type -AssemblyName System.Speech
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot 'app\src\androidTest\assets'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$output = Join-Path $outputDir 'chinese-classroom.wav'
$synth.SetOutputToWaveFile($output, $format)
$synth.Speak([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('5LuK5aSp5oiR5Lus5a2m5Lmg6K++56iL6L2s5YaZ5ZKM5aSN5Lmg77yM6K+35qCH6K6w6Ieq5bex6L+Y5LiN55CG6Kej55qE5Zyw5pa544CC')))
$synth.Dispose()
Write-Output $output
