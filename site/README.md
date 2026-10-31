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

## 禁止事项

- 不提交 `node_modules/`、`dist/`、APK、生产服务器配置或密钥。
- 不把生产环境密码、API Key、部署令牌写入前端源码。
- 不修改下载计数接口所依赖的生产后端。

部署由项目负责人执行；协作者只提交源码和 PR。
