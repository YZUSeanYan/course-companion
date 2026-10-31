# 知习运营后台

React + Vite + TypeScript 的独立管理后台，由 FastAPI 在 `/admin/` 托管。

## 本地开发

```bash
cd admin
npm ci
npm run dev
```

Vite 开发服务器会把 `/admin/api` 代理到 `http://127.0.0.1:8765`。先在 `server/` 启动网关，并在环境变量中配置：

```bash
export ADMIN_PASSWORD='至少 12 位的本地开发密码'
export ADMIN_SESSION_SECRET='本地随机会话密钥'
export ADMIN_COOKIE_SECURE=false
```

然后访问 `http://127.0.0.1:5174/#/`。

## 构建

```bash
npm ci
npm run build
```

产物在 `admin/dist/`，不提交到 Git。生产环境把整个目录部署到服务器，并让网关的 `ADMIN_DIST_DIR` 指向它。

## 页面

- 运营概览：请求、AI 学习包、音频分钟、翻译字符、活跃设备、错误率、每日趋势、接口和模型分布。
- 试用账号：新增/批量添加手机号，配置每日 AI 包、音频分钟、翻译字符、文档解析、有效期和最大设备数；查看今日用量与设备数；停用、解绑、删除。
- 设备：设备注册时间、最近请求、绑定手机号。
- 请求记录：接口、状态码、耗时，不记录请求正文。

## 安全边界

- 管理员密码和会话密钥只来自服务器环境变量，不能写进源码、前端 bundle 或 APK。
- 登录使用 HttpOnly + Secure + SameSite=Strict 的签名 cookie；写操作要求 `X-Requested-With: zhixi-admin`。
- 手机号在数据库中使用 Fernet 加密，查找使用 HMAC；前端默认脱敏显示。
- 管理后台只允许项目负责人使用，不对外开放注册。
