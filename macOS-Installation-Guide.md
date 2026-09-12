# macOS Installation Guide / macOS 安装说明

---

## 中文版本

### 首次安装后无法打开？或提示安装文件损坏？

这是 macOS 的安全保护机制导致的。Voconly 是免费开源软件，目前没有购买 Apple 开发者账号（每年需要 $99 美元），所以无法通过 Apple 的官方认证。但请放心，Voconly 完全安全，所有代码都可以在 GitHub 上查看。

### 解决方法（只需一次）

**重要：请先完成以下步骤后再执行命令：**
1. 下载 DMG 文件并打开
2. 将 Voconly 拖入 Applications 文件夹完成安装

然后打开**终端**（Command + 空格，输入"终端"），复制粘贴以下命令并回车：

```bash
xattr -cr /Applications/Voconly.app
```

如果提示输入密码，请输入您的 Mac 登录密码（输入时不会显示任何字符，这是正常的），然后回车。

完成后，就可以正常打开 Voconly 了。

---

## English Version

### Can't open after first install? Or says the file is damaged?

This is due to macOS security protection. Voconly is a free, open-source app. We haven't purchased an Apple Developer account ($99/year) yet, so it cannot be officially verified by Apple. But don't worry - Voconly is completely safe, and all source code is publicly available on GitHub.

### Solution (one-time setup)

**Important: Please complete these steps first:**
1. Download and open the DMG file
2. Drag Voconly into Applications folder to complete installation

Then open **Terminal** (press Command + Space, type "Terminal"), copy and paste the following command and press Enter:

```bash
xattr -cr /Applications/Voconly.app
```

If asked for a password, enter your Mac login password (nothing will appear while typing - this is normal), then press Enter.

After this, you can open Voconly normally.