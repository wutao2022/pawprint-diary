# 构建、签名与安装

## 环境

- Node.js 22 与 npm
- JDK 17
- Android SDK（建议安装 API 36 平台与对应 Build Tools）
- Android 7.0（API 24）或更高版本的设备/模拟器

## Debug 构建

```bash
npm ci
npm run typecheck
npm test -- --runInBand
cd android
./gradlew assembleDebug
```

Windows：

```powershell
npm ci
npm run typecheck
npm test -- --runInBand
Set-Location android
.\gradlew.bat assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。

## Release 签名

仓库不会提供发布私钥。先自行创建或准备 JKS，再复制示例配置：

```powershell
Copy-Item android\keystore.properties.example android\keystore.properties
```

编辑 `android/keystore.properties`：

```properties
storeFile=signing/your-release-key.jks
storePassword=replace-me
keyAlias=replace-me
keyPassword=replace-me
```

将 JKS 放入 `android/signing/` 后运行：

```powershell
Set-Location android
.\gradlew.bat assembleRelease
```

构建脚本在 Release 任务缺少配置时会立即失败，避免误发调试签名包。`android/keystore.properties`、`android/signing/` 和所有 JKS 均被 Git 忽略；不要将其粘贴到 Issue、日志或 CI 配置。

## 安装

1. 将 APK 复制到 Android 手机；
2. 在系统提示时仅允许当前文件管理器“安装未知应用”；
3. 打开 APK 完成安装，首次使用时按需授权通知、相机或所选照片。

系统 Photo Picker 不要求访问整个相册：它会显示设备媒体库及系统支持的云端媒体来源，应用只取得用户选中项目的访问权。
