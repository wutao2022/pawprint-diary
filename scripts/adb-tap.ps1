param(
  [Parameter(Mandatory = $true)][string]$Selector,
  [ValidateSet('desc','text','id')][string]$By = 'desc',
  [int]$Occurrence = 0
)
$artifactDir = Join-Path $PSScriptRoot '..\artifacts'
New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
$localXml = Join-Path $artifactDir 'uiautomator-current.xml'
adb shell uiautomator dump /sdcard/pawprint-uiautomator.xml | Out-Null
adb pull /sdcard/pawprint-uiautomator.xml $localXml | Out-Null
[xml]$document = Get-Content -LiteralPath $localXml -Raw -Encoding UTF8
$attribute = switch ($By) { 'desc' { 'content-desc' } 'text' { 'text' } 'id' { 'resource-id' } }
$matches = @($document.SelectNodes('//node') | Where-Object { $_.GetAttribute($attribute) -eq $Selector })
if ($matches.Count -le $Occurrence) { throw "UI node not found: $By=$Selector occurrence=$Occurrence" }
$bounds = $matches[$Occurrence].GetAttribute('bounds')
$numbers = [regex]::Matches($bounds, '\d+') | ForEach-Object { [int]$_.Value }
if ($numbers.Count -ne 4) { throw "Invalid bounds: $bounds" }
$x = [int](($numbers[0] + $numbers[2]) / 2)
$y = [int](($numbers[1] + $numbers[3]) / 2)
adb shell input tap $x $y
"TAPPED $By=$Selector at $x,$y bounds=$bounds"
