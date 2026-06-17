# Single source of truth — display names vs SSH aliases vs hostnames.
$DgxDisplayLocal  = 'DGX Sparks local'
$DgxDisplayRemote = 'DGX Sparks remote'
$DgxAliasLocal    = 'DGX-Local'
$DgxAliasRemote   = 'DGX-Remote'
$DgxHostLocal     = 'dgx-spark.local'
$DgxHostRemote    = '100.93.124.59'
$DgxUser          = 'sifr'
$DgxLanIp         = '10.0.0.158'

# Old NVIDIA Sync names only — NOT DGX-Local/DGX-Remote, NOT hostnames (dgx-spark.local etc.)
$DgxLegacyNvsyncAliases = @(
    'Sifr-DGX-Spark', 'Sifr-s-DGX-Spark', 'sifr-s-dgx-spark',
    'dgx-spark', 'DGX-Spark', 'DGX-Spark-2'
)
