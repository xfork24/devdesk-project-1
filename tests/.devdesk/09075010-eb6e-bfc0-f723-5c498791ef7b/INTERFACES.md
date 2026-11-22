# 独立后台验证接口

来源：execution-input:60dfec53-64d0-282f-d069-7faa645ea17f 的 task、design、test_configuration、workspace；基线 88a4c56fe6164dd6dfc9354f325f21002328f9ea，Task 09075010-eb6e-bfc0-f723-5c498791ef7b。采用 simplified-spec-tests:1、simplified-skill-test-design:2。

业务 API、错误码及落盘布局遵循冻结设计。为缺失模块固定以下测试接缝；实现者维护实际业务模块，不能修改此目录。

- server.cjs 导出 async createScreenshotServer({storageDirectory, captureRegion, captureTimeoutMs=120000, platform, fs})，返回 {server, csrfToken}；server 是尚未 listen 的 Node http.Server，csrfToken 是当前会话非空 token。测试在 127.0.0.1 临时端口启动；GET / 返回页面并可设置会话 Cookie；写请求使用该 Cookie、匹配 Origin、application/json 和 X-CSRF-Token。读取 factory 的 token 仅为测试注入接缝，生产页面如何获得 token 由实现者完成。
- fs 默认为 node:fs/promises，注入对象同其 API；用于确定复现 rename/open/sync 失败和提交栅栏，无业务替身。
- backend/capture.cjs 导出 captureRegion({destination,signal,platform=process.platform,spawn,timeoutMs=120000})，spawn 默认 node:child_process.spawn。可注入平台与进程仅为 Linux 上验证调用参数、取消、超时与回收；不证明 Mac 权限或真实截图。
- 错误可具有 code 或 error.code；HTTP 使用冻结的 {error:{code}}。

正式后台测试、三文件项目回归及 README 由实现/集成职责核对。真实 Mac 系统版本、实际参数及取消行为、非浏览器桌面内容、权限拒绝须由 integration 绑定实际代码另行验证。此步骤未执行平台 Red/Green，不将缺模块、导入或环境错误计为有效 Red。
