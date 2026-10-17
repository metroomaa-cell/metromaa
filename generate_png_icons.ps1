Add-Type -AssemblyName System.Drawing

function Draw-MetrromaIcon([int]$size, [string]$outPath, [bool]$darkBg = $true) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $scale = $size / 200.0

    if ($darkBg) {
        # Rich deep obsidian round squircle background
        $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 14, 12, 22))
        $g.FillRectangle($bgBrush, $rect)
        $bgBrush.Dispose()

        # Subtle golden border for app icons
        $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 212, 167, 84), [Math]::Max(1, 2 * $scale))
        $g.DrawRectangle($borderPen, 0, 0, $size - 1, $size - 1)
        $borderPen.Dispose()
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    # Gold Brushes & Pens
    $goldLightColor = [System.Drawing.Color]::FromArgb(255, 255, 245, 220)
    $goldMidColor   = [System.Drawing.Color]::FromArgb(255, 229, 195, 122)
    $goldDarkColor  = [System.Drawing.Color]::FromArgb(255, 184, 138, 56)

    $rectF = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $goldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rectF,
        $goldLightColor,
        $goldDarkColor,
        45.0
    )
    $goldPen = New-Object System.Drawing.Pen($goldBrush, [Math]::Max(1.0, 3.0 * $scale))
    $goldThinPen = New-Object System.Drawing.Pen($goldBrush, [Math]::Max(1.0, 1.2 * $scale))

    # Outer Rings
    $cx = $size / 2.0
    $cy = $size / 2.0
    $r1 = 88.0 * $scale
    $r2 = 82.0 * $scale

    $g.DrawEllipse($goldPen, ($cx - $r1), ($cy - $r1), ($r1 * 2), ($r1 * 2))
    $g.DrawEllipse($goldThinPen, ($cx - $r2), ($cy - $r2), ($r2 * 2), ($r2 * 2))

    # Center Monogram "M"
    # Left Pillar
    $lpX = 46.0 * $scale
    $lpY = 66.0 * $scale
    $lpW = 10.0 * $scale
    $lpH = 76.0 * $scale
    $g.FillRectangle($goldBrush, $lpX, $lpY, $lpW, $lpH)

    # Top & Bottom serifs on left pillar
    $g.FillRectangle($goldBrush, (40.0 * $scale), (64.0 * $scale), (22.0 * $scale), (4.0 * $scale))
    $g.FillRectangle($goldBrush, (40.0 * $scale), (140.0 * $scale), (22.0 * $scale), (4.0 * $scale))

    # Right Pillar
    $rpX = 144.0 * $scale
    $rpY = 66.0 * $scale
    $rpW = 10.0 * $scale
    $rpH = 76.0 * $scale
    $g.FillRectangle($goldBrush, $rpX, $lpY, $rpW, $rpH)

    # Top & Bottom serifs on right pillar
    $g.FillRectangle($goldBrush, (138.0 * $scale), (64.0 * $scale), (22.0 * $scale), (4.0 * $scale))
    $g.FillRectangle($goldBrush, (138.0 * $scale), (140.0 * $scale), (22.0 * $scale), (4.0 * $scale))

    # Left Diagonal
    $p1 = New-Object System.Drawing.PointF((56.0 * $scale), (68.0 * $scale))
    $p2 = New-Object System.Drawing.PointF((66.0 * $scale), (68.0 * $scale))
    $p3 = New-Object System.Drawing.PointF((100.0 * $scale), (124.0 * $scale))
    $p4 = New-Object System.Drawing.PointF((90.0 * $scale), (124.0 * $scale))
    $g.FillPolygon($goldBrush, @($p1, $p2, $p3, $p4))

    # Right Diagonal
    $p5 = New-Object System.Drawing.PointF((144.0 * $scale), (68.0 * $scale))
    $p6 = New-Object System.Drawing.PointF((134.0 * $scale), (68.0 * $scale))
    $p7 = New-Object System.Drawing.PointF((100.0 * $scale), (124.0 * $scale))
    $p8 = New-Object System.Drawing.PointF((110.0 * $scale), (124.0 * $scale))
    $g.FillPolygon($goldBrush, @($p5, $p6, $p7, $p8))

    # Apex Diamond Star
    $s1 = New-Object System.Drawing.PointF((100.0 * $scale), (34.0 * $scale))
    $s2 = New-Object System.Drawing.PointF((104.0 * $scale), (46.0 * $scale))
    $s3 = New-Object System.Drawing.PointF((116.0 * $scale), (50.0 * $scale))
    $s4 = New-Object System.Drawing.PointF((104.0 * $scale), (54.0 * $scale))
    $s5 = New-Object System.Drawing.PointF((100.0 * $scale), (66.0 * $scale))
    $s6 = New-Object System.Drawing.PointF((96.0 * $scale), (54.0 * $scale))
    $s7 = New-Object System.Drawing.PointF((84.0 * $scale), (50.0 * $scale))
    $s8 = New-Object System.Drawing.PointF((96.0 * $scale), (46.0 * $scale))
    $g.FillPolygon($goldBrush, @($s1, $s2, $s3, $s4, $s5, $s6, $s7, $s8))

    # Center Star Diamond Center
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, (98.5 * $scale), (48.5 * $scale), (3.0 * $scale), (3.0 * $scale))
    $whiteBrush.Dispose()

    # Center arch chevron
    $a1 = New-Object System.Drawing.PointF((92.0 * $scale), (122.0 * $scale))
    $a2 = New-Object System.Drawing.PointF((100.0 * $scale), (96.0 * $scale))
    $a3 = New-Object System.Drawing.PointF((108.0 * $scale), (122.0 * $scale))
    $a4 = New-Object System.Drawing.PointF((100.0 * $scale), (134.0 * $scale))
    $g.FillPolygon($goldBrush, @($a1, $a2, $a3, $a4))

    # Clean up
    $goldPen.Dispose()
    $goldThinPen.Dispose()
    $goldBrush.Dispose()
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Created: $outPath ($size x $size)"
}

$dirs = @(
  'C:\Users\sHaKiL\antigravity\metromaa-repo\uploads',
  'C:\Users\sHaKiL\antigravity\metromaa-repo\web\dist\uploads',
  'C:\Users\sHaKiL\antigravity\Body-Touch\dot-store\uploads',
  'C:\Users\sHaKiL\antigravity\Body-Touch\dot-store\web\dist\uploads'
)

foreach ($d in $dirs) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    Draw-MetrromaIcon 32 (Join-Path $d "favicon_32.png") $true
    Draw-MetrromaIcon 192 (Join-Path $d "favicon_192.png") $true
    Draw-MetrromaIcon 512 (Join-Path $d "favicon_512.png") $true
    Draw-MetrromaIcon 180 (Join-Path $d "apple-touch-icon.png") $true
    Draw-MetrromaIcon 256 (Join-Path $d "icon_metrroma.png") $false
}
