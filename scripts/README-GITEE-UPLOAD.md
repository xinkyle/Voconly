# Gitee Release 上传脚本使用说明

## 前置要求

### 1. 获取 Gitee Access Token

1. 访问：https://gitee.com/profile/personal_access_tokens
2. 点击"生成新令牌"
3. 勾选权限：
   - ✅ `projects` - 仓库权限（必需）
   - ✅ `releases` - 版本发布权限（必需）
4. 点击"提交"，复制生成的 token

### 2. 设置环境变量

**方式一：临时设置（当前会话有效）**
```powershell
$env:GITEE_ACCESS_TOKEN = "你的token"
```

**方式二：永久设置（推荐）**
1. 打开 PowerShell 配置文件：
   ```powershell
   notepad $PROFILE
   ```

2. 添加以下内容：
   ```powershell
   # Gitee Access Token
   $env:GITEE_ACCESS_TOKEN = "你的token"
   ```

3. 保存并重启 PowerShell

### 3. 确认配置

脚本中已配置：
- Gitee 用户名：`xingkyle`
- Gitee 仓库名：`Voconly`

如果不正确，请修改 `upload-release-gitee.ps1` 中的以下变量：
```powershell
$GiteeOwner = "xingkyle"  # Gitee 用户名
$GiteeRepo = "Voconly"    # Gitee 仓库名
```

## 使用方法

### 1. 构建版本

首先运行构建脚本：
```powershell
.\scripts\build-release-local.ps1
```

### 2. 上传到 Gitee

```powershell
.\scripts\upload-release-gitee.ps1 -Version "0.5.3"
```

将 `0.5.3` 替换为实际版本号。

## 工作流程

脚本会自动执行以下步骤：

1. ✅ 检查 Gitee access token
2. ✅ 检查构建文件（NSIS 安装包、签名文件）
3. ✅ 读取 changelog（可选：`scripts/CHANGELOG-版本号.md`）
4. ✅ 生成 `latest.json`（包含下载链接和签名）
5. ✅ 删除已存在的同名版本
6. ✅ 创建新版本
7. ✅ 上传文件（安装包、latest.json）

## 文件说明

### 上传的文件

- `Voconly_版本号_x64-setup.exe` - NSIS 安装包
- `latest.json` - 更新检查文件（包含签名）
- `Voconly_版本号_x64_en-US.msi` - MSI 安装包（可选）

### latest.json 内容

```json
{
  "version": "0.5.3",
  "date": "2026-09-02",
  "notes": "版本更新说明...",
  "platforms": {
    "windows-x86_64": {
      "url": "https://gitee.com/xingkyle/Voconly/releases/download/v0.5.3/Voconly_0.5.3_x64-setup.exe",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6I..."
    }
  }
}
```

## 常见问题

### Q: 提示 "GITEE_ACCESS_TOKEN environment variable not set"

**A:** 需要设置环境变量，参考上面的"设置环境变量"部分。

### Q: 上传失败

**A:** 检查以下项：
1. Token 是否有足够的权限（projects、releases）
2. 仓库是否存在
3. 网络连接是否正常
4. 文件是否已构建（运行 `build-release-local.ps1`）

### Q: curl not found

**A:** Windows 10+ 通常已内置 curl。如果找不到：
1. 安装 Git for Windows（包含 curl）
2. 或手动在 Gitee 网页上传文件

### Q: 如何验证上传成功？

**A:** 访问：https://gitee.com/xingkyle/Voconly/releases
应该能看到新创建的版本。

## 自动化建议

### 同时上传到 GitHub 和 Gitee

```powershell
# 上传到 GitHub
.\scripts\upload-release.ps1 -Version "0.5.3"

# 上传到 Gitee
.\scripts\upload-release-gitee.ps1 -Version "0.5.3"
```

### 创建一键发布脚本

可以创建一个组合脚本：
```powershell
# release-all.ps1
param([string]$Version)

Write-Host "Building..." -ForegroundColor Cyan
.\scripts\build-release-local.ps1

Write-Host "Uploading to GitHub..." -ForegroundColor Cyan
.\scripts\upload-release.ps1 -Version $Version

Write-Host "Uploading to Gitee..." -ForegroundColor Cyan
.\scripts\upload-release-gitee.ps1 -Version $Version

Write-Host "Release complete!" -ForegroundColor Green
```

## 注意事项

1. **Token 安全**：不要将 token 提交到代码仓库
2. **版本号**：确保版本号与构建版本一致
3. **签名文件**：需要先配置签名密钥才能生成 `.sig` 文件
4. **网络**：确保网络可以访问 Gitee API

## 相关链接

- Gitee API 文档：https://gitee.com/api/v5/swagger
- Gitee Token 管理：https://gitee.com/profile/personal_access_tokens
- 项目地址：https://gitee.com/xingkyle/Voconly