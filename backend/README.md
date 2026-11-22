# 本机截图后台

在用户 Mac 的图形登录会话中运行 `node server.cjs`，打开 `http://127.0.0.1:3000`。Node.js ≥22，无第三方依赖。`PORT` 可配置端口；`SCREENSHOT_DIRECTORY` 可配置绝对存储目录，默认 `~/Library/Application Support/WelcomeTabs/screenshots`。目录 0700、图片与元数据 0600。Linux 返回 `UNSUPPORTED_PLATFORM`，不能代替真实 Mac 框选验收。

捕获使用 `/usr/sbin/screencapture -i -s -x -t png <后台暂存路径>`，不启用 shell；默认 120 秒后终止，500ms 后仍未退出则发送 SIGKILL，等待 close 回收后释放捕获。正常退出且无图片表示取消；非零退出、无效 PNG 返回 `CAPTURE_FAILED`。PNG 校验包含分块 CRC、完整解压、尺寸、颜色格式、Adam7 行尺寸及过滤器。系统权限需授权启动后台的宿主应用：系统设置 → 隐私与安全性 → 屏幕与系统音频录制，必要时重启后台。权限失败与系统命令实际取消行为须在真实 Mac 验证。

`createScreenshotServer(options)` 返回 `{server, csrfToken}`，不自动监听；调用方须 `server.listen(port, '127.0.0.1')`。测试可注入 `storageDirectory`、`fs`、`captureRegion`、`platform`、`captureTimeoutMs`。捕获替身必须遵守 AbortSignal，并在资源回收完成后结束 Promise。

页面响应设置 HttpOnly、SameSite=Strict 会话 cookie，注入 `<meta name="csrf-token" content="…">`，同时返回 `X-CSRF-Token` 响应头。前端从 meta 读取 token，写请求携带 `X-CSRF-Token`、同源 cookie、匹配 Origin 和 `Content-Type: application/json`。重启后台后重新加载页面获取新会话。服务校验实际 Host 和端口，不开放 CORS；静态资源仅允许页面和 `/public/screenshots.js`。

- `GET /api/screenshots` → `{items}`，按 UTC createdAt、id 倒序。
- `POST /api/screenshots`，仅接受 `{requestId: UUID}` → 201 `{item}`，取消为 200 `{cancelled:true}`；已提交 requestId 返回原记录，执行中为 409 BUSY。
- `GET /api/screenshots/:id/image` → PNG，未知 id 为 404。
- `DELETE /api/screenshots/:id` → 204，重复删除同样成功。

记录为 `{id,createdAt,width,height,url}`。错误为 `{error:{code}}`，状态码沿用冻结设计；未知路由为 404 NOT_FOUND。客户端不得提交文件路径。进程级锁覆盖捕获与持久化，成功响应在清理暂存及释放锁后发送。断线不自动重试捕获，应重载历史协调结果。

捕获先写 `.pending/<id>/`，同步图片、metadata.json、暂存目录后原子移入已提交目录，等待父目录同步再报告成功；同步失败尝试移回暂存并返回存储错误。删除原子移入 `.trash/`，同步目录后成功响应，再异步清理。启动清理遗留暂存和垃圾；损坏元数据报 STORAGE_FAILED。UUID 目录及文件拒绝符号链接，图片读取使用 O_NOFOLLOW。持久化依赖本地文件系统的 rename/fsync 语义；不要让多个后台进程共用同一存储目录。

正式测试：`node --test test/screenshots-backend.test.cjs`。覆盖历史、重启、幂等、定向删除、故障与锁、安全边界、PNG 和子进程回收。Host 伪造使用 `http.request`，因为当前 Node 24 原生 fetch 会覆盖调用者的 Host 头。该测试不替代独立平台 Green 或真实 Mac 验收。README、前端和共享测试入口由 integration 接入。
