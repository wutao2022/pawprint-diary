# 架构说明

## 设计目标

爪印日记采用本地优先架构：核心功能在飞行模式下可运行，业务成功不依赖登录、后端或云服务。数据以稳定 UUID 关联宠物，照片和附件复制进应用私有目录，完整备份是跨设备迁移的唯一显式出口。

## 运行时分层

```text
Screens / Forms
       │ 用户操作、校验、页面联动
       ▼
AppContext + Repository
       │ 事务、宠物隔离、记录状态
       ▼
SQLite database ───── Private file storage
       │                       │
       ├── Notifications       └── Photos / attachments
       └── Backup & restore (.pawzip)
```

- `App.tsx`：应用壳、四个底部入口、悬浮记录按钮和全局弹层。
- `src/screens`：今天、日历、成长、档案以及通知/备份工具页。
- `src/components/forms.tsx`：宠物、护理、健康、成长和附件表单。
- `src/state/AppContext.tsx`：当前宠物、数据刷新和跨页面一致性。
- `src/data/repository.ts`：唯一业务读写入口；使用宠物 ID 过滤关联记录。
- `src/data/database.ts`：SQLite 建表、版本迁移、外键、WAL 和完整性检查。
- `src/data/files.ts`：私有文件目录与照片/附件复制、移动、删除。
- `src/services`：通知、备份恢复、资料导出与诊断。

## 数据模型与联动

`pets` 是聚合根；`pet_photos`、`care_schedules`、`care_records`、`health_records`、`timeline_entries`、`attachments` 和 `expenses` 通过 `pet_id` 关联。切换宠物时，Context 更新当前 ID，各页面重新查询对应记录，避免依赖宠物名称造成串档。

护理提醒完成后会在同一事务中写入历史记录；若配置周期，会基于完成日期创建下一条待办。稍后处理会更新计划日期并重新同步本地通知。软删除的数据进入 `trash`，默认保留 30 天后清理。

数据库使用 `PRAGMA foreign_keys = ON` 和 WAL。每次打开执行增量迁移并运行 `PRAGMA integrity_check`；当前数据库版本见 `DATABASE_VERSION`。

## 文件、权限与隐私

照片选择优先使用 Android 系统 Photo Picker。用户只授权所选项目的临时读取权，应用随后将文件复制到自己的沙盒；相机仅在用户主动拍摄时请求权限。应用不申请通讯录、位置、电话、麦克风或整个媒体库的读取权限。

业务数据库、宠物照片、成长照片和附件均在应用私有目录。Android 清单中的网络权限来自 React Native/Expo 调试与运行基础设施，但应用没有业务后端、账号、遥测或自动上传代码。

## 通知

护理计划保存后根据 `due_date - reminder_days` 安排本地通知，通知标识记录在 `notification_jobs`。完成、跳过、删除和稍后会取消或重建对应通知；应用启动时同步未完成计划。权限被拒绝时，记录仍然保留，今天页继续显示逾期/待办。

## 备份与恢复

导出流程关闭/落盘数据库快照，收集相对路径文件，写入带格式版本和清单的 `.pawzip`。恢复流程：

1. 将输入复制到临时目录并读取清单；
2. 拒绝绝对路径、反斜杠、`..` 和未列入清单的危险路径；
3. 保存当前数据库和文件快照；
4. 替换数据并执行 SQLite 完整性与版本校验；
5. 成功后重建通知，失败则恢复原快照。

## 构建与密钥边界

Debug 构建使用 Android 默认调试证书。Release 构建只从本地 `android/keystore.properties` 读取签名信息；该文件和 JKS 均被 `.gitignore` 排除。CI 只构建 Debug，不持有发布私钥。
