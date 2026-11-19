# 本轮浏览器验收

Task be7c68cb-9bf0-40b1-5808-5c26aab1e3f0，implementation round 2。依据 execution-input:e2091d93-7cee-152b-0b1b-5a609aa78b9c 的 task、design、recipe、red、test_configuration、workspace 端口；workspace 原件 ddb48d2b-61ab-0ac9-f446-a3a4d7e0122f 已读取至 next_offset=null，digest 874e8e333984c31a6845e9021b813bb98ff860be3bfa326867409ef7d34a9b4f。规范 simplified-spec-implementation:1，技能 simplified-skill-implementation:1。

本轮只新增流程证据；产品源码、README、正式测试和独立 tests/ 均未修改。页面绑定 revision 3894720644e52b779e40ce2663768fc5fa77c390；index.html Git blob 1f0906fe8f4bc361881070cf7a1824f2006c7ac1，与冻结差异一致；SHA-256 1b01d776329b00419f0888607d3bce0a00c4fd3f5458e2f256467cd413e99e48。

## 实际执行

命令：bash run-browser.sh；cwd 为本文件所在目录。脚本设置 TMPDIR、XDG_CONFIG_HOME、XDG_CACHE_HOME、FONTCONFIG_FILE、LD_LIBRARY_PATH 指向本目录，再执行 node browser-check.cjs。Linux aarch64、Node v24.13.0、Playwright 1.58.2；实际 browser.version() 为 145.0.7632.0，使用 Chromium Headless Shell（真实浏览器渲染及键盘输入，无 DOM 模拟）。外层冻结镜像 sha256:cfdd13360965d846cf746bf829782d65247e5cb8e986c71271124f908e09673d 仅标识本轮 harness；临时浏览器与运行库另由本目录 package-lock.json、deps/*.deb 和浏览器文件定位。

最终原生执行 2026-11-19T15:41:28.164Z 至 15:41:29.379Z，退出码 0，正常完成，无超时、取消。stdout 原件 browser-stdout.log（完整 JSON，status=passed、两组 runs、每组八次观察），stderr 原件 browser-stderr.log（空）。原生命令观察 chunk c28c04 / 859b68；这些均不是平台 tests.run 回执。完整逐项结果见 browser-results.json，操作见 browser-check.cjs，可复执行入口 run-browser.sh。

## AC-2 / AC-3 观察

1280×800 与 320×568 视口分别执行：初始中文 → 鼠标点击英文 → 鼠标点击中文 → 刷新并 Tab → Enter 英文 → 空格中文 → 空格英文 → Enter 中文。每一步在操作返回后立即读取 DOM，无额外等待，欢迎文本及按钮目标语言均符合预期。每步原 h1、title、html lang 均保留，无 pageerror。

Tab 后实际 activeElement 为按钮，:focus-visible=true，计算轮廓 solid 3px rgb(0,95,204)。按钮初始矩形桌面 (1174,16,90,44)、窄屏 (214,16,90,44)，底部均为 60；欢迎区域顶部 156.875。每一步检查按钮在视口内、位于页面上方、与欢迎区域不重叠，且页面宽度没有溢出。截图 focus-1280.png、focus-320.png、english-1280.png、english-320.png、chinese-1280.png、chinese-320.png；已目视核对窄屏焦点截图和桌面英文截图，欢迎内容清晰、按钮可见。

## 限制与失败记录

仅覆盖该 Chromium 内核和上述两个视口，未扩展至其他浏览器、读屏器或移动设备。安装期间 npm 默认缓存与 /tmp 不可写，改用本目录；apt 索引和下载日志在 apt/、deps/。完整 Chrome 因缺库及启动 SIGTRAP 失败，记录 browser-launch-failed.log、browser-crashpad-failed.log、browser-proc-failed.log、browser-single-process-failed.log；Headless Shell 单进程启动失败见 browser-shell-single-failed.log，恢复正常多进程后通过。这些环境失败均未当成业务测试结果。

已消费冻结平台 Red：operation 271eb24a-c09e-94e3-1df8-3ea04de37965，candidate 25e1f5fe684f9be6fe58fa9823b97e5d7a9f0d5e，4 项中 3 个业务断言失败、1 项保留检查通过。本轮不重复平台独立测试或回归；最终版本 Green 与 regression=null 的记录由平台产生。本目录材料仅留在 Task/Feature 分支，不进入最终代码 PR。
