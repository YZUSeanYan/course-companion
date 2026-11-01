# 知习开发上手指南

这份指南面向第一次参与 Android 项目、但会使用 AI agent 的同学。先按本指南把项目跑起来，再开始修改。

## 1. 项目由五部分组成

| 目录 | 内容 | 需要的工具 |
|---|---|---|
| `app/` | 知习 Android App | JDK 17+、Android SDK 36 |
| `server/` | FastAPI 学习服务网关（App 与网页版共用） | Python 3.11+ |
| `site/` | 知习官网（部署于 `shuike.seanyan.store`） | Node.js 20.19+ 或 22.12+ |
| `admin/` | 运营后台（构建后由网关托管在 `/admin/`） | Node.js 20.19+ 或 22.12+ |
| `webapp/` | 知习网页版（部署于 `zhixi.seanyan.store/web/`，与 App 共用网关和额度体系） | Node.js 20.19+ 或 22.12+ |

官网源码已统一放入 `site/`。不要再修改其他目录里的历史网站文件。

## 2. 一次性安装

Windows 推荐安装：

1. **Git for Windows**
2. **GitHub Desktop**：最简单的克隆、分支和 PR 工具。
3. **Android Studio**：自带 Android SDK/JDK，非计算机专业优先使用它完成 SDK 安装。
4. **Python 3.11+**：安装时勾选 “Add Python to PATH”。
5. **Node.js LTS**：使用 22 LTS 或更新的 LTS。

不需要单独安装 Gradle，仓库自带 Gradle Wrapper。也不需要 NDK 或 CMake。

## 3. 获取代码

1. 把自己的 GitHub 用户名发给项目负责人，接受私有仓库邀请。
2. 打开 GitHub Desktop，登录自己的账号。
3. `File → Clone repository → URL`，输入项目负责人提供的仓库地址。
4. 默认分支选择 `main`。

在终端进入仓库后先确认：

```powershell
git status
git branch --show-current
```

不要在 `main` 上直接修改。用 GitHub Desktop 新建分支，例如 `feat/my-first-fix`。

## 4. 启用提交前安全检查

在仓库根目录执行一次：

```powershell
git config core.hooksPath .githooks
```

以后每次提交会自动运行 `scripts/check-repo.ps1`，阻止密钥、模型、APK、数据库和超大文件误提交。

也可以手动运行：

```powershell
powershell -File scripts/check-repo.ps1
```

## 5. 运行 Android App

### 5.1 用 Android Studio

1. `File → Open` 选择仓库根目录。
2. 等待 Gradle Sync。
3. 在 SDK Manager 安装：
   - Android SDK Platform 36
   - Android SDK Build-Tools 36
   - Android SDK Platform-Tools
4. 创建或连接 Android 10（API 29）以上的设备。
5. 运行 `app` 配置。

若 Android Studio 没有生成 `local.properties`，可自行创建：

```properties
sdk.dir=C\:\\Users\\<你的Windows用户名>\\AppData\\Local\\Android\\Sdk
```

`local.properties` 只用于你的电脑，不会提交。

### 5.2 命令行

Android Studio 的 JDK 通常位于：

```text
C:\Program Files\Android\Android Studio\jbr
```

PowerShell 示例：

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:lintDebug
.\gradlew.bat :app:assembleDebug
```

Debug APK 位于：

```text
app\build\outputs\apk\debug\app-debug.apk
```

### 5.3 离线模型

仓库不提交模型权重。Release App 也不会内置模型。

- 真机安装后进入「设置 → 离线识别模型」下载即可。
- `app/src/debug/assets/models` 和 `app/src/androidTest/assets/model-fixtures` 都是本地私有文件，不能提交。
- 缺少本地测试模型时，相关设备测试会明确跳过；这不等于功能已经验证。

### 5.4 设备测试

连接 arm64 真机或可用设备后：

```powershell
.\gradlew.bat :app:connectedDebugAndroidTest
```

当前 App 打包目标为 `arm64-v8a`。x86_64 模拟器不能代表真实 ASR、麦克风、长时间录音和国产 ROM 后台行为。

## 6. 运行服务端

```powershell
cd server
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt

$env:TOKEN_PEPPER = "local-development-only-not-a-production-secret"
$env:DATABASE_PATH = "local-dev.db"
$env:DOCUMENT_STORAGE_ROOT = "document_assets"

python -m pytest
uvicorn app.main:app --host 127.0.0.1 --port 8765
```

App 模拟器访问电脑服务时使用 `http://10.0.2.2:8765`；真机不能使用 `10.0.2.2`，应填写电脑局域网 IP 或已部署的 HTTPS 网关。

不要使用真实生产 API Key 做日常测试。需要模型联调时，由项目负责人提供受限测试方式；普通功能测试使用 mock。

## 7. 运行官网

```powershell
cd site
npm ci
npm run dev
```

生产构建：

```powershell
npm run build
```

`npm run lint` 目前仍有已知模板组件错误，不能直接声称全量 lint 通过。至少保证 `npm run build` 成功，并对修改的文件做定向检查。

## 8. 使用 AI agent 的正确方式

在任务开头把下面内容发给 AI：

```text
请先阅读 AGENTS.md、docs/ONBOARDING.md 和 CONTRIBUTING.md，并严格遵守。
当前分支是 <分支名>。本次只完成：<一个明确目标>。
不要部署生产，不读取或提交密钥/真实课堂数据，不使用 git add -A。
修改后运行相关测试，并准确汇报修改文件、测试结果和未验证项。
```

推荐任务粒度：

- “修复课程页某个按钮没有反馈”
- “给学习内容增加导出测试”
- “更新官网 FAQ 中过时的说明”
- “为一个 FastAPI 失败路径补测试”

避免一次让 AI 做“重写整个项目”“升级所有依赖”“顺便整理代码”。

## 9. 测试要求

| 修改内容 | 最低验证 |
|---|---|
| Kotlin 非 UI 逻辑 | `:app:testDebugUnitTest` |
| Android UI/资源/Manifest | 单测 + `:app:lintDebug` + 模拟器/真机手测 |
| 录音、ASR、通知、模型下载 | arm64 真机测试；没有设备就写“未验证” |
| Room 表结构 | Migration + schema JSON + 迁移测试 |
| FastAPI | `python -m pytest` |
| 官网 | `npm run build` + 浏览器检查 |

禁止为了“变绿”而删除测试、降低断言或跳过失败路径。

## 10. 提交和 PR

1. GitHub Desktop 中确认只改了本次目标文件。
2. 运行 `git status`。
3. 运行 `powershell -File scripts/check-repo.ps1`。
4. 提交，例如：
   - `feat: add learning export feedback`
   - `fix: prevent duplicate course list keys`
   - `docs: update onboarding`
5. Push 当前分支，不要 Push 到 `main`。
6. 在 GitHub 点击 “Compare & pull request”。
7. 在 PR 中写明：改了什么、为什么、跑了什么测试、哪些没有验证。
8. 至少一位同学审阅后，由项目负责人 Squash merge。

## 11. 常见问题

### `SDK location not found`

安装 Android SDK，并让 Android Studio 生成 `local.properties`，或设置 `ANDROID_HOME`。

### Gradle 出现 `GradleWorkerMain ClassNotFoundException`

通常是 JDK 或路径异常。优先设置不带单引号/中文的 `JAVA_HOME`，例如 Android Studio 的 `jbr`。

### App 连不上电脑后端

- 模拟器：`10.0.2.2` 指向电脑。
- 真机：使用同一可信网络下电脑的局域网 IP，或使用 HTTPS 网关。
- 后端端口应为 `8765`，先访问 `/health`。

### 没有模型，ASR 测试失败或跳过

Release 不内置模型。先通过 App 设置下载。设备测试需要本地 `model-fixtures`，仓库不会提交；缺少时测试应按设计跳过并显示原因。

### 官网下载链接为什么没有本地 APK

官网只保存下载地址。APK 由负责人构建、签名并上传，不进入 Git 仓库。

### 可以修改生产服务器吗

不可以。协作者只能修改源码和提交 PR。部署、签名、发布和服务器操作只由项目负责人执行。

## 12. 文档权威顺序

1. `AGENTS.md`：安全和协作硬规则。
2. `docs/ONBOARDING.md`：本地开发步骤。
3. `README.md`：产品能力与整体说明。
4. `docs/VERIFICATION.md`：最近一次实际验收结果与边界。
5. `docs/LECSYNC_COMPATIBILITY.md`：Lecsync 能力与计费口径。
6. `server/README.md`：服务端接口与安全说明。
7. `site/README.md`：官网构建与发布信息。

旧版本交接书、旧宣发稿和历史设计文档只代表过去，不作为当前事实。
