# 欢迎页

用浏览器直接打开项目中的 `index.html`，即可看到“欢迎来到这里”标题，无需启动服务器。页面不加载外部资源。

独立欢迎文案默认显示“欢迎”。点击右上角的 English 按钮后显示“Welcome”，按钮变为“中文”；再次点击即可切回。按钮支持 Tab 聚焦及 Enter/空格操作。切换即时完成，不请求网络、不刷新页面、不保存语言偏好；重新打开或刷新页面恢复中文。原页面标题与 h1 保留。

欢迎文字下的提示默认显示“语言切换支持键盘操作”，英文状态显示“Language switching supports keyboard controls”，切回或刷新后恢复中文。提示随页面自然换行。按钮 title 在中文状态精确为“切换为英文”，英文状态精确为“Switch to Chinese”，静态页面及刷新均从中文目标提示开始。

运行测试需要 Node.js ≥22，以及对页面和测试文件的读取权限；无需安装依赖。

在项目根目录执行：

```sh
node --test tests/welcome.test.cjs
```

两个用例各自读取实际页面，分别检查页面可读取且非空、包含完整的 h1 欢迎标题。测试通过时退出码为 0；文件无法读取、页面为空或标题缺失时相应检查失败，退出码非 0。测试仅读取页面，可重复运行，并通过测试文件所在目录定位页面。

这些检查验证文件内容；请在浏览器打开页面，人工确认欢迎标题清晰可见。

正式语言兼容测试放在 `test/`，不依赖独立测试目录：

```sh
node --test tests/welcome.test.cjs test/welcome-language.test.cjs
```

新增测试执行实际页面脚本，检查初始中文、连续双向切换、重新装载恢复中文和节点缺失时安全退出。它使用最小 DOM 替身，不验证浏览器布局或键盘事件；请在浏览器及窄视口核对按钮位于右上方、焦点可见且不遮挡欢迎内容。

提示正式测试位于 `test/language-hint.test.cjs`，覆盖静态与初始化提示及 title、原有24次逐次切换、24组完整往返及两种语言状态重新装载。运行全部正式及既有测试：

```sh
node --test tests/welcome.test.cjs test/*.test.cjs
```

真实浏览器验收入口为 `test/browser-acceptance.cjs`（Linux、Node.js ≥22）。它直接读取项目 `index.html` 并打开其真实 file URL；不替换 HTML。依赖需预先装在私有运行目录：

```sh
export DEVDESK_RUNTIME_DIR=/tmp/devdesk-runtime
export DEVDESK_RUNTIME_CACHE="$DEVDESK_RUNTIME_DIR/shared"
npm install --prefix "$DEVDESK_RUNTIME_DIR/node" playwright@1.58.2
PLAYWRIGHT_BROWSERS_PATH="$DEVDESK_RUNTIME_CACHE/browsers" \
  "$DEVDESK_RUNTIME_DIR/node/node_modules/.bin/playwright" install chromium
node test/browser-acceptance.cjs
# 可选：与原始 HTML 的实际文件比较（不生成或修改该文件）
node test/browser-acceptance.cjs /absolute/path/to/original.html
```

可配置环境变量：

| 变量 | 用途 / 默认值 |
| --- | --- |
| `PLAYWRIGHT_MODULE` | 私有 Playwright 模块绝对路径；默认 `$DEVDESK_RUNTIME_DIR/node/node_modules/playwright` |
| `BROWSER_EXECUTABLE` | Chromium 可执行文件路径；未指定时使用 Playwright 管理的浏览器 |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright 浏览器缓存目录，应设在 runtime/cache 内 |
| `LD_LIBRARY_PATH`、`FONTCONFIG_FILE`、`XDG_CACHE_HOME` | 可选择私有系统库、字体配置及字体缓存；相关文件仅放 runtime/cache |
| `BROWSER_BASELINE` | 可选基线 HTML 路径；命令行第一个参数优先 |
| `BROWSER_OUTPUT` | 截图及 `result.json` 目录；默认 `$DEVDESK_RUNTIME_DIR/browser-acceptance`，可选新的小体积验收证据目录 |
| `BROWSER_TIMEOUT_MS` | 总运行时限，默认 90000ms，允许 100～300000ms；清理额外约 100ms |

入口在 320×720、1280×720 下检查鼠标、Tab 聚焦、Enter、Space、原有24次逐次切换、24组完整往返、静态及动态 title、英文/中文状态刷新，逐次断言三处文案及 lang、精确 ARIA 关联、全部元素中的提示 ID 唯一和节点复用。可选基线比较元素边界、字体和初始截图字节；未提供基线时结果明确为 `not_requested`。每个视口输出 `updated-*.png`，指定基线时另有 `baseline-*.png`。请为每次需保留的执行选择不同输出目录。

stdout 最后一行为 JSON，`result.json` 保存同一结果：`status`、起止时间、`timedOut`、`signal`、`error`；成功时还有源码/基线路径、file URL、SHA-256、入口摘要、Node/Playwright/浏览器版本及各视口 `records`。通过退出 0；断言、环境、超时、关闭失败退出非 0。启动配置错误可能只向 stderr 输出失败 JSON。原始命令观测由执行平台另行保存，结果文件不替代它，也不替代独立 Red/Green 或三文件平台回归。

worker 使用 try/finally 关闭页面、连接和浏览器服务；监督进程约束整个 worker，超时或 SIGINT/SIGTERM 时强制结束自己创建的进程组及已登记浏览器进程组，删除私有临时 profile。入口在私有临时目录自动生成启动包装器，在 exec 浏览器前记录 PID，使启动未完成时也能清理；无需人工临时脚本。启动也受 Playwright 15 秒时限约束。字体等待、截图和关闭均有界；字体缺失会影响真实外观，须配置实际所需字体。SIGKILL、宿主崩溃或系统 PID 资源耗尽可能阻止清理代码运行，需操作者维护后重跑，不可将清理视为验收通过。此前尝试出现过 PID 资源耗尽，操作者清理属于维护；已冻结成功/失败观察继续保留，本入口通过不撤销旧失败，也不证明所有故障恢复路径均已验证。下载、系统库、浏览器、缓存及临时文件均不得放入 `/work`。

本次入口维护验收依据冻结输入 `execution-input:96c1af72-b074-9a0f-bd0a-a18e5707ca10` 的 task、design、implementation、workspace、recipe、red、test_configuration；workspace 输出 `0d504c60-5d2a-f86a-2155-4d180944c574` 已读完全部 205612 字节，版本 `7ada7ac2d09bad96d405897c20cac5e006d96a23`。页面 SHA-256 保持 `352e34fcd4a5193f44327d085461ae8c49c539bfccf7886f010d63b6d47bf525`；本轮仅维护入口和本说明，另新增验收证据。独立测试、正式 language-hint 断言和既有证据未修改。

本轮最终执行（目录 `/work`）：

```sh
FONTCONFIG_FILE=/tmp/devdesk-runtime/fonts.conf \
LD_LIBRARY_PATH=/tmp/devdesk-runtime/shared/recovered-8e125841/sysroot/usr/lib/aarch64-linux-gnu:/tmp/devdesk-runtime/shared/recovered-8e125841/sysroot/lib/aarch64-linux-gnu \
BROWSER_EXECUTABLE=/tmp/devdesk-runtime/shared/browsers/chromium-1208/chrome-linux/chrome \
BROWSER_OUTPUT=/work/evidence/.devdesk/19fe7521-2a56-3b7a-1f7a-482b09b3e3d1/maintained-final \
node test/browser-acceptance.cjs /tmp/devdesk-runtime/baseline-language.html
```

Node v24.13.0、Playwright 1.58.2、Chromium 145.0.7632.0；本轮外层冻结镜像为 `sha256:cfdd13360965d846cf746bf829782d65247e5cb8e986c71271124f908e09673d`。基线文件根据已冻结单属性差异在 runtime 内还原，并核对 SHA-256 为 `20a98d1a14e130dc3dfd2423d36a3152c5b053121202bf3c5b40831a95fb81f8`；入口本身仅接受原 HTML 文件，不构造基线。入口 SHA-256 为 `251eb8a90cf70a532f2187bd773c05d3efc3ef8bd1e1fa236029f0ae00e3b0c8`。

原生操作 `exec-83e3139b-8040-4701-b5d7-cd38ed4d7740`，开始/完成 Unix ms 为 1795134028244 / 1795134053401，exit=0、completed，无超时或取消；stdout 记录两个视口全部检查通过、布局及截图一致，stderr 无失败输出。最终四张截图共 54958 字节，见 [结果](evidence/.devdesk/19fe7521-2a56-3b7a-1f7a-482b09b3e3d1/maintained-final/result.json)。[原始观测](evidence/.devdesk/19fe7521-2a56-3b7a-1f7a-482b09b3e3d1/maintained-final/command-observation.json) 原样复制自 `/run/devdesk/command-output/f9e602dca6913a5debde7c5feb2e0e35ca7851a08a268c7d53e3478b1ad3f9c9.json`，已核对字节一致，SHA-256 为 `07b0f2f9195afa4d311ce9e52ca3e5d19b1359b24c3092b380fc26df808f3f22`；保留实际 thread、turn、命令、时间、退出码。

同目录的 `maintained-browser/` 保留本轮较早入口版本通过的结果及原始观测。`maintained-timeout/` 保留最终入口 2500ms 总超时的 exit=1 观察（操作 `exec-e7ea2264-b2ef-4779-82fa-38729c63a07b`）；`maintained-failure/` 保留不存在浏览器的 exit=1 环境失败观察（操作 `exec-01d36dde-23c4-4213-ae3d-96cbd54818b6`）。两者均正常结束监督进程并经过清理路径，不是业务 Red 或验收通过；本轮新增证据约 131 KB。语法检查通过。没有运行或宣称通过平台 Green、三文件源/候选回归、独立评审、Human 或 Git 门禁；这些仍由原工作流负责。
