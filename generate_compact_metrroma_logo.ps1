Add-Type -AssemblyName System.Drawing

function Draw-MetrromaCompactLogo([string]$outPath) {
    $width = 755
    $height = 252
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $g.Clear([System.Drawing.Color]::Transparent)

    # Gold Colors matching SECRATE
    $goldLight = [System.Drawing.Color]::FromArgb(255, 255, 246, 225)
    $goldDark  = [System.Drawing.Color]::FromArgb(255, 185, 140, 52)

    $emblemRect = New-Object System.Drawing.RectangleF(10, 10, 232, 232)
    $goldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $emblemRect,
        $goldLight,
        $goldDark,
        55.0
    )

    # --- LEFT: THE EMBLEM (232 x 232) ---
    $cx = 126.0
    $cy = 126.0
    $r1 = 108.0
    $r2 = 100.0

    $goldPen = New-Object System.Drawing.Pen($goldBrush, 4.0)
    $goldThinPen = New-Object System.Drawing.Pen($goldBrush, 1.8)

    $g.DrawEllipse($goldPen, ($cx - $r1), ($cy - $r1), ($r1 * 2), ($r1 * 2))
    $g.DrawEllipse($goldThinPen, ($cx - $r2), ($cy - $r2), ($r2 * 2), ($r2 * 2))

    $scale = 232.0 / 200.0
    $offX = 10.0
    $offY = 10.0

    # Left Pillar
    $g.FillRectangle($goldBrush, ($offX + 46.0 * $scale), ($offY + 66.0 * $scale), (11.0 * $scale), (76.0 * $scale))
    $g.FillRectangle($goldBrush, ($offX + 39.0 * $scale), ($offY + 64.0 * $scale), (25.0 * $scale), (5.0 * $scale))
    $g.FillRectangle($goldBrush, ($offX + 39.0 * $scale), ($offY + 138.0 * $scale), (25.0 * $scale), (5.0 * $scale))

    # Right Pillar
    $g.FillRectangle($goldBrush, ($offX + 143.0 * $scale), ($offY + 66.0 * $scale), (11.0 * $scale), (76.0 * $scale))
    $g.FillRectangle($goldBrush, ($offX + 136.0 * $scale), ($offY + 64.0 * $scale), (25.0 * $scale), (5.0 * $scale))
    $g.FillRectangle($goldBrush, ($offX + 136.0 * $scale), ($offY + 138.0 * $scale), (25.0 * $scale), (5.0 * $scale))

    # Left Diagonal
    $p1 = New-Object System.Drawing.PointF(($offX + 57.0 * $scale), ($offY + 69.0 * $scale))
    $p2 = New-Object System.Drawing.PointF(($offX + 68.0 * $scale), ($offY + 69.0 * $scale))
    $p3 = New-Object System.Drawing.PointF(($offX + 100.0 * $scale), ($offY + 124.0 * $scale))
    $p4 = New-Object System.Drawing.PointF(($offX + 89.0 * $scale), ($offY + 124.0 * $scale))
    $g.FillPolygon($goldBrush, @($p1, $p2, $p3, $p4))

    # Right Diagonal
    $p5 = New-Object System.Drawing.PointF(($offX + 143.0 * $scale), ($offY + 69.0 * $scale))
    $p6 = New-Object System.Drawing.PointF(($offX + 132.0 * $scale), ($offY + 69.0 * $scale))
    $p7 = New-Object System.Drawing.PointF(($offX + 100.0 * $scale), ($offY + 124.0 * $scale))
    $p8 = New-Object System.Drawing.PointF(($offX + 111.0 * $scale), ($offY + 124.0 * $scale))
    $g.FillPolygon($goldBrush, @($p5, $p6, $p7, $p8))

    # Apex Diamond Star
    $s1 = New-Object System.Drawing.PointF(($offX + 100.0 * $scale), ($offY + 34.0 * $scale))
    $s2 = New-Object System.Drawing.PointF(($offX + 104.5 * $scale), ($offY + 46.0 * $scale))
    $s3 = New-Object System.Drawing.PointF(($offX + 117.0 * $scale), ($offY + 50.0 * $scale))
    $s4 = New-Object System.Drawing.PointF(($offX + 104.5 * $scale), ($offY + 54.0 * $scale))
    $s5 = New-Object System.Drawing.PointF(($offX + 100.0 * $scale), ($offY + 66.0 * $scale))
    $s6 = New-Object System.Drawing.PointF(($offX + 95.5 * $scale), ($offY + 54.0 * $scale))
    $s7 = New-Object System.Drawing.PointF(($offX + 83.0 * $scale), ($offY + 50.0 * $scale))
    $s8 = New-Object System.Drawing.PointF(($offX + 95.5 * $scale), ($offY + 46.0 * $scale))
    $g.FillPolygon($goldBrush, @($s1, $s2, $s3, $s4, $s5, $s6, $s7, $s8))

    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, ($offX + 98.0 * $scale), ($offY + 48.0 * $scale), 4.0, 4.0)
    $whiteBrush.Dispose()

    # Center Arch
    $a1 = New-Object System.Drawing.PointF(($offX + 92.0 * $scale), ($offY + 122.0 * $scale))
    $a2 = New-Object System.Drawing.PointF(($offX + 100.0 * $scale), ($offY + 96.0 * $scale))
    $a3 = New-Object System.Drawing.PointF(($offX + 108.0 * $scale), ($offY + 122.0 * $scale))
    $a4 = New-Object System.Drawing.PointF(($offX + 100.0 * $scale), ($offY + 134.0 * $scale))
    $g.FillPolygon($goldBrush, @($a1, $a2, $a3, $a4))

    # --- RIGHT: BRAND NAME & SUBTITLE ---
    # Title: METRROMA (Size 54, Bold, fits perfectly with 40px right margin)
    $titleFont = New-Object System.Drawing.Font("Georgia", 53, [System.Drawing.FontStyle]::Bold)
    $titleRect = New-Object System.Drawing.RectangleF(265, 46, 470, 80)
    $titleBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $titleRect,
        $goldLight,
        $goldDark,
        90.0
    )

    $g.DrawString("METRROMA", $titleFont, $titleBrush, 265.0, 50.0)

    # Subtitle: For your stylish world. (Size 23, exactly like SECRATE's "For your personal world.")
    $subFont = New-Object System.Drawing.Font("Segoe UI", 23, [System.Drawing.FontStyle]::Regular)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 205, 185, 148))
    $subText = "For your stylish world."
    $g.DrawString($subText, $subFont, $subBrush, 270.0, 150.0)

    # Cleanup
    $subBrush.Dispose()
    $subFont.Dispose()
    $titleBrush.Dispose()
    $titleFont.Dispose()
    $goldPen.Dispose()
    $goldThinPen.Dispose()
    $goldBrush.Dispose()
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Created Compact Logo: $outPath ($width x $height)"
}

$dirs = @(
  'C:\Users\sHaKiL\antigravity\metromaa-repo\uploads',
  'C:\Users\sHaKiL\antigravity\metromaa-repo\web\dist\uploads',
  'C:\Users\sHaKiL\antigravity\Body-Touch\dot-store\uploads',
  'C:\Users\sHaKiL\antigravity\Body-Touch\dot-store\web\dist\uploads'
)

foreach ($d in $dirs) {
    Draw-MetrromaCompactLogo (Join-Path $d "logo_metrroma.png")
}
