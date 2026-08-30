param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [string]$AssetsDirectory = (Join-Path $PSScriptRoot '..\assets')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
$resolvedAssets = (Resolve-Path -LiteralPath $AssetsDirectory).Path
$canvasSize = 1024
$foregroundSize = 800
$foregroundOffset = [int](($canvasSize - $foregroundSize) / 2)
$cream = [System.Drawing.ColorTranslator]::FromHtml('#F8F5EE')

function New-Canvas([System.Drawing.Color]$background) {
  $bitmap = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear($background)
  $graphics.Dispose()
  return $bitmap
}

function Draw-Foreground([System.Drawing.Bitmap]$canvas, [System.Drawing.Image]$source) {
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($source, $foregroundOffset, $foregroundOffset, $foregroundSize, $foregroundSize)
  $graphics.Dispose()
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$name) {
  $path = Join-Path $resolvedAssets $name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  return $path
}

$source = [System.Drawing.Image]::FromFile($resolvedSource)
try {
  $legacy = New-Canvas $cream
  $foreground = New-Canvas ([System.Drawing.Color]::Transparent)
  $background = New-Canvas $cream
  $monochrome = New-Canvas ([System.Drawing.Color]::Transparent)
  try {
    Draw-Foreground $legacy $source
    Draw-Foreground $foreground $source
    # Android uses the alpha channel of monochromeImage and applies the user's
    # themed-icon tint, so preserving the same silhouette is intentional.
    Draw-Foreground $monochrome $source

    Save-Png $legacy 'icon.png'
    Save-Png $foreground 'android-icon-foreground.png'
    Save-Png $background 'android-icon-background.png'
    Save-Png $monochrome 'android-icon-monochrome.png'
    Save-Png $foreground 'splash-icon.png'
  } finally {
    $legacy.Dispose()
    $foreground.Dispose()
    $background.Dispose()
    $monochrome.Dispose()
  }
} finally {
  $source.Dispose()
}
