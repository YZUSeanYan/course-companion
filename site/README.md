# 知习官网

Vite + React + TypeScript 静态站点，使用 HashRouter。页面包括首页、功能、下载、反馈和隐私政策。

## 本地开发

要求 Node.js `^20.19.0` 或 `>=22.12.0`。

```bash
npm ci
npm run dev
```

默认开发地址由 Vite 输出。生产构建：

```bash
npm run build
```

构建结果在 `dist/`，该目录不会被提交。

## 发布信息

版本、APK 地址和 SHA-256 的唯一当前来源是：

```text
src/lib/release.ts
```

发布新 APK 时必须同步更新：

1. `src/lib/release.ts` 中的版本、APK 文件名和 SHA-256；
2. `index.html` 中的页面描述；
3. 根目录 `README.md` 和 `docs/VERIFICATION.md`。

官网修改至少运行 `npm run build`。当前 UI 模板目录还有已知 ESLint 错误，不能把“全量 lint 通过”写成事实。

## APK 分发线路

- `CURRENT_RELEASE.apkUrl` 默认指向 Gitee 发行附件；`backupApkUrl` 指向官网独立备用直链，两条线路必须是同一签名包、相同 SHA-256。
- 旧官网 `/downloads/zhixi-v2.0.11.apk` 返回 302 到 Gitee；`/downloads/backup/zhixi-v2.0.11.apk` 直接提供原文件，不再跳转，避免备用线路循环。
- 切换默认线路前必须完成整包下载哈希和测速，不能只测 HEAD/HTTP 200；镜像尚未上传或校验失败时不得先修改线上按钮。
- 2026-11-11：Gitee 2.0.11 整包实测 24.58 秒、2.07 MB/s，哈希与官网已发布 APK 一致；此前源站实测 125.1 秒。网络速度会变化，不作固定倍数承诺。
- 上传只新增发行附件，不删除/替换旧附件；令牌只能在受控工具中使用，不输出、不写入源码/命令参数或 Git。

## 禁止事项

- 不提交 `node_modules/`、`dist/`、APK、生产服务器配置或密钥。
- 不把生产环境密码、API Key、部署令牌写入前端源码。
- 不修改下载计数接口所依赖的生产后端。

部署由项目负责人执行；协作者只提交源码和 PR。
