param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][ValidateSet("pdf", "docx")][string]$OutputFormat
)

$word = $null
$document = $null

try {
  $resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
  $resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path
  $outputPath = Join-Path $resolvedOutput "source.$OutputFormat"

  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $document = $word.Documents.Open(
    $resolvedInput,
    $false,
    $true,
    $false,
    "",
    "",
    $false,
    "",
    "",
    0,
    0,
    $false,
    $true,
    0,
    $true,
    ""
  )

  if ($OutputFormat -eq "pdf") {
    $document.ExportAsFixedFormat($outputPath, 17)
  } else {
    $document.SaveAs2($outputPath, 16)
  }
} finally {
  if ($document) {
    $document.Close($false)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
  }
  if ($word) {
    $word.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
