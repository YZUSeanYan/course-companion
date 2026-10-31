Add-Type -AssemblyName System.Speech
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot 'app\src\androidTest\assets'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$output = Join-Path $outputDir 'english-classroom.wav'
$synth.SetOutputToWaveFile($output, $format)
$synth.Speak('Today we will learn how artificial intelligence supports modern manufacturing. Please explain the difference between supervised and unsupervised learning. Remember to review the key vocabulary after class.')
$synth.Dispose()
Write-Output $output
