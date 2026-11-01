# 知习协作仓库：AI Agent 必须遵守的规则

本仓库用于「知习」Android App、FastAPI 学习网关和官网的协作开发。团队成员主要不是计算机专业，所有 AI agent 在修改前必须先读本文件与 `docs/ONBOARDING.md`。

## 1. 开始任何任务前

1. 运行 `git status` 和 `git branch --show-current`，确认当前分支不是 `main`。
2. 新任务必须从最新 `main` 创建独立分支：
   - 功能：`feat/<简短主题>`
   - 修复：`fix/<简短主题>`
   - 文档：`docs/<简短主题>`
3. 每次只处理一个逻辑目标；不要顺手重命名、全量格式化或升级依赖。
4. 修改前阅读目标文件及同目录相邻实现，沿用现有 Kotlin/Compose、FastAPI 和 React 风格。

## 2. 绝对禁止

- 禁止读取、输出、复制或提交任何真实密钥、`.env`、服务器生产配置、keystore、签名口令或设备 token。
- 禁止提交真实教师/学生录音、课堂正文、姓名、学号、手机号、上传讲义或生产数据库。
- 禁止执行 SSH、SCP、rsync、systemctl、nginx、DNS、APK 上传、官网发布或任何生产环境写操作。
- 禁止修改本仓库之外的任何项目，尤其是原离线「水课雷达」和在线版「课堂雷达」。
- 禁止 `git add -A`、`git add .`、`git push --force`、`git push origin main`、推送 tag 或改写历史。
- 禁止删除失败测试、放宽断言、跳过测试或把未验证功能写成“已通过”。
- 禁止重新启用已退出的“自动老师提问检测”；手动「标记疑问」必须保留。
- 禁止把“退出应用后仍偷偷录音”“后台自动上传”“记录课堂正文日志”之类行为加入产品。

## 3. 目录地图

```text
app/                 Android App（Kotlin + Jetpack Compose）
  src/main/          生产源码与资源
  src/test/          JVM 单元测试
  src/androidTest/   模拟器/真机测试
  schemas/           Room 数据库 schema
server/              FastAPI 自有网关
  app/               REST / WebSocket / 提供方适配
  tests/             pytest
admin/               运营后台（React + Vite，构建后由网关托管在 /admin/）
site/                官网（React + Vite）
webapp/              网页版（React + Vite + Dexie；一期云端版，见 webapp/README.md）
docs/                产品、验收、上线说明
scripts/             本地检查与开发辅助
```

关键入口：

- `app/src/main/java/com/classroomradar/app/MainActivity.kt`：主界面与页面导航。
- `app/src/main/java/com/classroomradar/app/audio/RecordingService.kt`：录音、暂停/继续、识别与翻译编排。
- `app/src/main/java/com/classroomradar/app/audio/ModelPackageManager.kt`：离线模型下载、校验、回收站。
- `app/src/main/java/com/classroomradar/app/data/ClassroomDatabase.kt`：Room v8。
- `app/src/main/java/com/classroomradar/app/learning/LearningPresenter.kt`：学习包、讲义与复习。
- `server/app/main.py`：网关入口；`server/app/v2_provider.py`：模型调用与严格校验。
- `server/app/admin_routes.py`：运营后台登录、账号与统计 API。
- `admin/src/`：运营后台页面；`admin/dist` 不提交。
- `site/src/pages/Apply.tsx`：官网试用申请页；短信验证码与自动开户规则见 `docs/VERIFICATION.md`。
- `site/src/lib/release.ts`：官网版本、APK 地址与 SHA-256 的唯一当前来源。

## 4. 本地私有文件

以下内容必须由开发者在本机创建或被忽略，不能提交：

- `local.properties`（Android SDK 路径）
- `server/.env*`、真实 API Key、`TOKEN_PEPPER`
- `app/src/debug/assets/models/`、`app/src/androidTest/assets/model-fixtures/`
- `server/.venv/`、数据库、`server/document_assets/`、`server/lecsync_uploads/`
- `site/node_modules/`、`site/dist/`
- APK/AAB、keystore、签名材料、部署压缩包
- 真实课堂音频/转写和用户讲义

## 5. 测试要求

### Android

```bash
./gradlew.bat :app:testDebugUnitTest
./gradlew.bat :app:lintDebug
```

- 修改 UI、资源或 Manifest：必须跑 lint。
- 修改 Room 表：必须新增 Migration、更新 `app/schemas/`，并增加迁移测试；不得使用破坏性迁移。
- 修改录音、ASR、通知、模型下载或云端回退：有 arm64 真机时运行 `:app:connectedDebugAndroidTest`；没有真机时只能写“未验证”。
- 需要本地模型 fixture 的设备测试会跳过；这不是失败，也不能报告成“设备能力已验证”。

### Server

```bash
cd server
python -m pytest
```

- 新增接口必须覆盖鉴权、配额、请求校验和失败路径。
- 测试只能使用 mock/fixture，不调用真实付费模型或生产 Lecsync。
- 服务端请求 URL 只允许 `http/https`，必须拒绝 localhost、环回、私有和保留地址。

### 官网

```bash
cd site
npm ci
npm run build
```

### 运营后台

```bash
cd admin
npm ci
npm run build
```

- 管理后台只允许项目负责人使用；不得把管理员密码写入前端、源码、测试或示例。
- 手机号是敏感个人信息：服务端必须加密保存，App 只能保存脱敏号码；不得在日志、错误消息或测试 fixture 中使用真实手机号。
- 阿里云短信凭据只能来自服务器环境变量；验证码只保存 HMAC 摘要，必须有过期、尝试次数上限、重发冷却和手机号/IP 限流。未配置短信时申请接口必须明确失败，不得用固定验证码或日志输出替代。
- 修改账号、配额或管理 API 必须覆盖未激活、停用、到期、设备上限、CSRF 和越权路径。

- 当前全量 ESLint 仍有已知模板错误；修改文件应定向检查，不得伪造“lint 全绿”。

## 6. 版本与发布信息

修改 App 版本或发布 APK 时，需要同步检查：

- `app/build.gradle.kts`
- `README.md`
- `docs/VERIFICATION.md`
- `site/src/lib/release.ts`
- `site/index.html`

发布签名、版本号确认、生产部署和官网发布只能由项目负责人人工执行。AI agent 可以准备构建和说明，但不能发布。

## 7. 安全与隐私产品约束

- 本地识别优先；原始录音默认不保存、不上传。
- 云端听课、音频转写、翻译、文档解析、AI 学习包必须由用户主动开启。
- 云端录音 30 天保留必须明确提示且默认关闭。
- AI 生成内容必须允许核对来源；OCR 不得冒充视觉理解。
- 服务端不得记录课堂正文、讲义正文、音频或密钥。
- 删除文件必须进入回收站/隔离目录，禁止直接永久删除或 `rm -rf`。

## 8. 提交与 PR

1. 只暂存本次任务明确修改的文件，禁止 `git add -A`。
2. 提交前运行 `powershell -File scripts/check-repo.ps1`。
3. 提交信息使用简短明确格式：`feat: ...`、`fix: ...`、`docs: ...`。
4. Push 当前功能分支，并在 GitHub 创建 PR；不要直接推送 `main`。
5. PR 中写明：
   - 改了什么；
   - 为什么改；
   - 实际运行了哪些测试；
   - 哪些验证没有做；
   - 是否涉及数据库、权限、隐私或版本发布。
6. 至少一位同学审阅后再合并；使用 Squash merge。

## 9. AI Agent 完成任务时必须汇报

- 修改的文件列表；
- 实际执行的测试命令和真实结果；
- 失败、跳过或未验证的项目；
- 是否有数据库/权限/隐私/版本变化；
- 是否还有需要人工完成的发布步骤。

不要用“应该可以”“理论上通过”代替实际结果。
