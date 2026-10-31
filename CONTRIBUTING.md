# 参与知习开发

欢迎参与知习！即使没有计算机专业背景，也可以和 AI agent 一起完成小功能、测试或文档改进。

开始前请阅读：

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
3. [`docs/AI_IMPLEMENTATION.md`](docs/AI_IMPLEMENTATION.md)

## 基本流程

1. 接受 GitHub 邀请并登录自己的账号。
2. 使用 GitHub Desktop 克隆私有仓库。
3. 从 `main` 创建分支：
   - 功能：`feat/你的主题`
   - 修复：`fix/你的主题`
   - 文档：`docs/你的主题`
4. 让 AI 先读 `AGENTS.md`，再修改一个明确的小目标。
5. 运行对应测试。
6. 提交并 Push 当前分支。
7. 在 GitHub 创建 Pull Request，等待至少一位同学审阅。

不要直接向 `main` 推送，也不要使用 `git add -A`。

## 提交前三项检查

```powershell
git status
powershell -File scripts/check-repo.ps1
```

确认：

- 没有 `.env`、API Key、签名文件；
- 没有真实教师/学生录音、课堂正文或上传讲义；
- 没有模型权重、APK、数据库和构建产物；
- 只包含你本次准备提交的文件。

## AI agent 任务提示模板

```text
请先阅读 AGENTS.md 和 docs/ONBOARDING.md，并严格遵守。
当前分支是 <分支名>，本次只完成：<一个明确目标>。
不要部署生产，不读取或提交密钥/真实课堂数据，不使用 git add -A。
完成后运行相关测试，并准确汇报修改文件、测试结果和未验证项。
```

## 隐私与安全

课堂录音、转写和讲义属于敏感数据。不要把它们上传到 Issue、PR、聊天记录或测试 fixture。需要使用音频时，请使用合成样本或获得明确授权。

服务端的 API Key 只存在于环境变量或密钥服务中，任何协作者都不需要也不应接触生产密钥。
