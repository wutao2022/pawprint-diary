Add-Type -AssemblyName System.Drawing

function New-PawImage {
  param([string]$Path, [int]$Size, [bool]$Transparent = $false, [bool]$Monochrome = $false)
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  if ($Transparent) { $graphics.Clear([System.Drawing.Color]::Transparent) } else { $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#F5F1E8')) }
  $sage = if ($Monochrome) { [System.Drawing.Color]::White } else { [System.Drawing.ColorTranslator]::FromHtml('#6F8F72') }
  $cream = if ($Monochrome) { [System.Drawing.Color]::Transparent } else { [System.Drawing.ColorTranslator]::FromHtml('#F5F1E8') }
  $coral = if ($Monochrome) { [System.Drawing.Color]::White } else { [System.Drawing.ColorTranslator]::FromHtml('#E98266') }
  $sageBrush = [System.Drawing.SolidBrush]::new($sage)
  $creamBrush = [System.Drawing.SolidBrush]::new($cream)
  $coralBrush = [System.Drawing.SolidBrush]::new($coral)
  $s = $Size / 1024.0
  $graphics.FillEllipse($sageBrush, [single](322*$s), [single](382*$s), [single](380*$s), [single](380*$s))
  $graphics.FillEllipse($sageBrush, [single](177*$s), [single](258*$s), [single](192*$s), [single](252*$s))
  $graphics.FillEllipse($sageBrush, [single](655*$s), [single](258*$s), [single](192*$s), [single](252*$s))
  $graphics.FillEllipse($sageBrush, [single](317*$s), [single](150*$s), [single](176*$s), [single](240*$s))
  $graphics.FillEllipse($sageBrush, [single](531*$s), [single](150*$s), [single](176*$s), [single](240*$s))
  if (-not $Monochrome) {
    $graphics.FillEllipse($creamBrush, [single](387*$s), [single](545*$s), [single](250*$s), [single](178*$s))
    $graphics.FillEllipse($coralBrush, [single](430*$s), [single](562*$s), [single](44*$s), [single](44*$s))
    $graphics.FillEllipse($coralBrush, [single](550*$s), [single](562*$s), [single](44*$s), [single](44*$s))
    $pen = [System.Drawing.Pen]::new($coral, [single](20*$s))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawArc($pen, [single](462*$s), [single](590*$s), [single](100*$s), [single](90*$s), 20, 140)
    $pen.Dispose()
  }
  $graphics.Dispose(); $sageBrush.Dispose(); $creamBrush.Dispose(); $coralBrush.Dispose()
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$assets = (Resolve-Path (Join-Path $PSScriptRoot '..\assets')).Path
New-PawImage -Path (Join-Path $assets 'icon.png') -Size 1024
New-PawImage -Path (Join-Path $assets 'android-icon-foreground.png') -Size 432 -Transparent $true
New-PawImage -Path (Join-Path $assets 'android-icon-monochrome.png') -Size 432 -Transparent $true -Monochrome $true
New-PawImage -Path (Join-Path $assets 'splash-icon.png') -Size 512
