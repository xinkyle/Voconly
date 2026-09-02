# 测试 Gitee Token 权限
$GiteeToken = $env:GITEE_ACCESS_TOKEN
$GiteeOwner = "xingkyle"
$GiteeRepo = "Voconly"

Write-Host "测试 Gitee API 访问..." -ForegroundColor Cyan

# 1. 测试获取用户信息
Write-Host ""
Write-Host "[1] 测试获取用户信息..." -ForegroundColor Yellow
try {
    $UserUrl = "https://gitee.com/api/v5/user?access_token=$GiteeToken"
    $UserResponse = Invoke-RestMethod -Uri $UserUrl -Method Get
    Write-Host "✅ 用户名: $($UserResponse.login)" -ForegroundColor Green
    Write-Host "   用户ID: $($UserResponse.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ 获取用户信息失败: $_" -ForegroundColor Red
}

# 2. 测试获取仓库信息
Write-Host ""
Write-Host "[2] 测试获取仓库信息..." -ForegroundColor Yellow
try {
    $RepoUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo?access_token=$GiteeToken"
    $RepoResponse = Invoke-RestMethod -Uri $RepoUrl -Method Get
    Write-Host "✅ 仓库名: $($RepoResponse.full_name)" -ForegroundColor Green
    Write-Host "   仓库ID: $($RepoResponse.id)" -ForegroundColor Gray
    Write-Host "   权限: push=$($RepoResponse.permissions.push), admin=$($RepoResponse.permissions.admin)" -ForegroundColor Gray
} catch {
    Write-Host "❌ 获取仓库信息失败: $_" -ForegroundColor Red
}

# 3. 测试列出 releases
Write-Host ""
Write-Host "[3] 测试获取版本列表..." -ForegroundColor Yellow
try {
    $ReleasesUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo/releases?access_token=$GiteeToken"
    $ReleasesResponse = Invoke-RestMethod -Uri $ReleasesUrl -Method Get
    Write-Host "✅ 当前有 $($ReleasesResponse.Count) 个版本" -ForegroundColor Green
} catch {
    Write-Host "❌ 获取版本列表失败: $_" -ForegroundColor Red
}

# 4. 测试创建版本（使用最小参数）
Write-Host ""
Write-Host "[4] 测试创建测试版本..." -ForegroundColor Yellow
try {
    $CreateUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo/releases"
    $TestBody = @{
        access_token = $GiteeToken
        tag_name = "test-v0.0.1"
        name = "Test Release"
        body = "Test"
        prerelease = $true
    }

    $CreateResponse = Invoke-RestMethod -Uri $CreateUrl -Method Post -Body $TestBody
    Write-Host "✅ 创建成功！版本ID: $($CreateResponse.id)" -ForegroundColor Green

    # 删除测试版本
    Write-Host "   删除测试版本..." -ForegroundColor Gray
    $DeleteUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo/releases/$($CreateResponse.id)"
    $DeleteBody = @{ access_token = $GiteeToken }
    Invoke-RestMethod -Uri $DeleteUrl -Method Delete -Body $DeleteBody | Out-Null
    Write-Host "   ✅ 测试版本已删除" -ForegroundColor Green
} catch {
    Write-Host "❌ 创建版本失败: $_" -ForegroundColor Red
    Write-Host "   错误详情: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "测试完成！" -ForegroundColor Cyan