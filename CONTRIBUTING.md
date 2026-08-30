# 参与贡献

感谢你帮助改进爪印日记。提交前请先搜索已有 Issue；较大的功能或数据模型变更建议先开 Issue 说明用户场景、迁移方案和隐私影响。

## 本地开发

```bash
npm ci
npm run typecheck
npm test -- --runInBand
cd android && ./gradlew assembleDebug
```

Windows 使用 `android\gradlew.bat assembleDebug`。

## 变更要求

- 保持本地优先：新增网络、账号、分析或云同步能力必须默认关闭，并经过明确的隐私评审。
- 跨页面字段要走完整数据链：表单、Repository、SQLite、刷新状态、备份恢复与测试同步更新。
- 数据库结构变更必须递增 `DATABASE_VERSION`，提供前向迁移并保留旧备份兼容策略。
- 文件导入必须复制到应用私有目录；备份恢复必须继续防御目录穿越并支持失败回滚。
- 权限应最小化。优先使用 Android 系统照片选择器，不为批量读取媒体申请宽泛权限。
- 新增逻辑至少补充 Jest 测试；UI/权限/通知/生命周期变更需在模拟器或设备上回归。
- 不得提交 Release 私钥、密码、API Key、真实用户数据、真实宠物病历或未经授权的图片。

## Pull Request

PR 请保持单一目标，并写明：变更原因、用户可见行为、测试证据、数据库/备份影响、权限或隐私影响。界面变更请附修改前后截图。
