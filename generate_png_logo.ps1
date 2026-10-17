Add-Type -AssemblyName System.Drawing

function Draw-MetrromaFullLogo([string]$outPath) {
    $width = 680
    $height = 136
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $g.Clear([System.Drawing.Color]::Transparent)

    # Gold Colors
    $goldLightColor = [System.Drawing.Color]::FromArgb(255, 255, 248, 230)
    $goldMidColor   = [System.Drawing.Color]::FromArgb(255, 235, 205, 138)
    $goldDarkColor  = [System.Drawing.Color]::FromArgb(255, 184, 138, 56)

    $rectF = New-Object System.Drawing.RectangleF(0, 0, $width, $height)
    $goldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rectF,
        $goldLightColor,
        $goldDarkColor,
        25.0
    )

    $iconSize = 104.0
    $scale = $iconSize / 200.0
    $offsetX = 16.0
    $offsetY = 16.0

    # Draw Icon Rings
    $cx = $offsetX + ($iconSize / 2.0)
    $cy = $offsetY + ($iconSize / 2.0)
    $r1 = 88.0 * $scale
    $r2 = 82.0 * $scale

    $goldPen = New-Object System.Drawing.Pen($goldBrush, 2.5)
    $goldThinPen = New-Object System.Drawing.Pen($goldBrush, 1.0)

    $g.DrawEllipse($goldPen, ($cx - $r1), ($cy - $r1), ($r1 * 2), ($r1 * 2))
    $g.DrawEllipse($goldThinPen, ($cx - $r2), ($cy - $r2), ($r2 * 2), ($r2 * 2))

    # Icon Monogram M
    # Left Pillar
    $g.FillRectangle($goldBrush, ($offsetX + 46.0 * $scale), ($offsetY + 66.0 * $scale), (10.0 * $scale), (76.0 * $scale))
    $g.FillRectangle($goldBrush, ($offsetX + 40.0 * $scale), ($offsetY + 64.0 * $scale), (22.0 * $scale), (4.0 * $scale))
    $g.FillRectangle($goldBrush, ($offsetX + 40.0 * $scale), ($offsetY + 140.0 * $scale), (22.0 * $scale), (4.0 * $scale))

    # Right Pillar
    $g.FillRectangle($goldBrush, ($offsetX + 144.0 * $scale), ($offsetY + 66.0 * $scale), (10.0 * $scale), (76.0 * $scale))
    $g.FillRectangle($goldBrush, ($offsetX + 138.0 * $scale), ($offsetY + 64.0 * $scale), (22.0 * $scale), (4.0 * $scale))
    $g.FillRectangle($goldBrush, ($offsetX + 138.0 * $scale), ($offsetY + 140.0 * $scale), (22.0 * $scale), (4.0 * $scale))

    # Diagonals
    $p1 = New-Object System.Drawing.PointF(($offsetX + 56.0 * $scale), ($offsetY + 68.0 * $scale))
    $p2 = New-Object System.Drawing.PointF(($offsetX + 66.0 * $scale), ($offsetY + 68.0 * $scale))
    $p3 = New-Object System.Drawing.PointF(($offsetX + 100.0 * $scale), ($offsetY + 124.0 * $scale))
    $p4 = New-Object System.Drawing.PointF(($offsetX + 90.0 * $scale), ($offsetY + 124.0 * $scale))
    $g.FillPolygon($goldBrush, @($p1, $p2, $p3, $p4))

    $p5 = New-Object System.Drawing.PointF(($offsetX + 144.0 * $scale), ($offsetY + 68.0 * $scale))
    $p6 = New-Object System.Drawing.PointF(($offsetX + 134.0 * $scale), ($offsetY + 68.0 * $scale))
    $p7 = New-Object System.Drawing.PointF(($offsetX + 100.0 * $scale), ($offsetY + 124.0 * $scale))
    $p8 = New-Object System.Drawing.PointF(($offsetX + 110.0 * $scale), ($offsetY + 124.0 * $scale))
    $g.FillPolygon($goldBrush, @($p5, $p6, $p7, $p8))

    # Apex Diamond Star
    $s1 = New-Object System.Drawing.PointF(($offsetX + 100.0 * $scale), ($offsetY + 34.0 * $scale))
    $s2 = New-Object System.Drawing.PointF(($offsetX + 104.0 * $scale), ($offsetY + 46.0 * $scale))
    $s3 = New-Object System.Drawing.PointF(($offsetX + 116.0 * $scale), ($offsetY + 50.0 * $scale))
    $s4 = New-Object System.Drawing.PointF(($offsetX + 104.0 * $scale), ($offsetY + 54.0 * $scale))
    $s5 = New-Object System.Drawing.PointF(($offsetX + 100.0 * $scale), ($offsetY + 66.0 * $scale))
    $s6 = New-Object System.Drawing.PointF(($offsetX + 96.0 * $scale), ($offsetY + 54.0 * $scale))
    $s7 = New-Object System.Drawing.PointF(($offsetX + 84.0 * $scale), ($offsetY + 50.0 * $scale))
    $s8 = New-Object System.Drawing.PointF(($offsetX + 96.0 * $scale), ($offsetY + 46.0 * $scale))
    $g.FillPolygon($goldBrush, @($s1, $s2, $s3, $s4, $s5, $s6, $s7, $s8))

    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, ($offsetX + 98.5 * $scale), ($offsetY + 48.5 * $scale), 3.0, 3.0)
    $whiteBrush.Dispose()

    # Center Arch
    $a1 = New-Object System.Drawing.PointF(($offsetX + 92.0 * $scale), ($offsetY + 122.0 * $scale))
    $a2 = New-Object System.Drawing.PointF(($offsetX + 100.0 * $scale), ($offsetY + 96.0 * $scale))
    $a3 = New-Object System.Drawing.PointF(($offsetX + 108.0 * $scale), ($offsetY + 122.0 * $scale))
    $a4 = New-Object System.Drawing.PointF(($offsetX + 100.0 * $scale), ($offsetY + 134.0 * $scale))
    $g.FillPolygon($goldBrush, @($a1, $a2, $a3, $a4))

    # Right: Brand Typography "METRROMA"
    $fontFamily = "Georgia"
    try {
        $installed = New-Object System.Drawing.Text.InstalledFontCollection
        $names = $installed.Families | ForEach-Object { $_.Name }
        if ($names -contains "Cinzel") { $fontFamily = "Cinzel" }
        elseif ($names -contains "Playfair Display") { $fontFamily = "Playfair Display" }
        elseif ($names -contains "Cormorant Garamond") { $fontFamily = "Cormorant Garamond" }
    } catch {}

    $mainFont = New-Object System.Drawing.Font($fontFamily, 44, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.RectangleF(140, 20, 520, 60)),
        [System.Drawing.Color]::FromArgb(255, 255, 255, 255),
        [System.Drawing.Color]::FromArgb(255, 238, 212, 155),
        90.0
    )

    # Wide letter spaced METRROMA
    $letters = "M E T R R O M A"
    $g.DrawString($letters, $mainFont, $textBrush, 142.0, 24.0)

    # Subtitle: LUXURY ESSENTIALS
    $subFont = New-Object System.Drawing.Font("Segoe UI", 12.5, [System.Drawing.FontStyle]::Bold)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 216, 175, 95))
    $subText = "C O N T E M P O R A R Y   L U X U R Y"
    $g.DrawString($subText, $subFont, $subBrush, 152.0, 86.0)

    # Elegant horizontal accent line
    $accentPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 216, 175, 95), 1.2)
    $g.DrawLine($accentPen, 148, 80, 640, 80)

    # Cleanup
    $accentPen.Dispose()
    $subBrush.Dispose()
    $subFont.Dispose()
    $textBrush.Dispose()
    $mainFont.Dispose()
    $goldPen.Dispose()
    $goldThinPen.Dispose()
    $goldBrush.Dispose()
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Created Full Logo: $outPath"
}

$dirs = @(
  'C:\Users\sHaKiL\antigravity\metromaa-repo\uploads',
  'C:\Users\sHaKiL\antigravity\metromaa-repo\web\dist\uploads',
  'C:\Users\sHaKiL\antigravity\Body-Touch\dot-store\uploads',
  'C:\Users\sHaKiL\antigravity\Body-Touch\dot-store\web\dist\uploads'
)

foreach ($d in $dirs) {
    Draw-MetrromaFullLogo (Join-Path $d "logo_metrroma.png")
}
