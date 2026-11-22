# 欢迎页

用浏览器直接打开项目中的 `index.html`，即可看到“欢迎来到这里”标题，无需启动服务器。标题和语言按钮无需网络；图片窗通过 HTTPS 加载 Pexels 外部图片，需要网络连接。

页面不再显示独立“欢迎”段落和“语言切换支持键盘操作”提示，也不保留其占位或描述关联。页面标题、h1 和图片窗的全部文字随语言切换：包括按钮、图片来源说明、五张图片替代文字及加载、成功、失败、展开提示。专有名称与 Pexels 链接保持原样。右上角按钮初始显示 English，点击后变为“中文”，再次点击切回；支持 Tab 聚焦和 Enter/空格操作。切换不请求网络、不刷新页面、不保存偏好，刷新恢复中文状态。切换保留图片索引、加载请求、展开、滚动和焦点；异步回调使用当时的当前语言，过期回调忽略。按钮 title 在中文状态为“切换到英文”，英文状态为“Switch to Chinese (Simplified)”。

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

正式测试执行实际页面全部脚本，检查初始中文、整页连续双向切换、五图文字、异步成功/失败和过期回调、重新装载恢复中文以及节点缺失时安全退出。它使用最小 DOM 替身，不验证浏览器布局或键盘事件；请在浏览器及窄视口核对按钮位于右上方、焦点可见且不遮挡欢迎内容。

描述移除正式测试位于 `test/language-hint.test.cjs`，覆盖静态与初始化无目标节点、无悬空关联、title、24次逐次切换、24组完整往返及两种语言状态重新装载；同时接入图片窗断言。运行全部正式及既有测试：

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
| `BROWSER_OUTPUT` | 截图及 `result.json` 目录；默认 `$DEVDESK_RUNTIME_DIR/browser-acceptance`；本 Task 保留证据时设为 `evidence/.devdesk/140e9e7b-5742-f990-1d4f-1bedd673a8e0/` 下的新目录 |
| `BROWSER_TIMEOUT_MS` | 总运行时限，默认 90000ms，允许 100～300000ms；清理额外约 100ms |

入口在 320×720、1280×720 下检查鼠标、Tab 聚焦、Enter、Space、原有24次逐次切换、24组完整往返、静态及动态 title、英文/中文状态刷新，逐次断言按钮文字、title、lang、按钮复用、目标节点和专属段落占位不存在，并检查可见焦点。可选基线比较保留控件和标题的边界及字体、图片窗尺寸和自然上移，保存前后截图供核对；未提供基线时结果明确为 `not_requested`。每个视口输出 `updated-*.png`，指定基线时另有 `baseline-*.png`。请为每次需保留的执行选择不同输出目录。

stdout 最后一行为 JSON，`result.json` 保存同一结果：`status`、起止时间、`timedOut`、`signal`、`error`；成功时还有源码/基线路径、file URL、SHA-256、入口摘要、Node/Playwright/浏览器版本及各视口 `records`。通过退出 0；断言、环境、超时、关闭失败退出非 0。启动配置错误可能只向 stderr 输出失败 JSON。原始命令观测由执行平台另行保存，结果文件不替代它，也不替代独立 Red/Green 或三文件平台回归。

worker 使用 try/finally 关闭页面、连接和浏览器服务；监督进程约束整个 worker，超时或 SIGINT/SIGTERM 时强制结束自己创建的进程组及已登记浏览器进程组，删除私有临时 profile。入口在私有临时目录自动生成启动包装器，在 exec 浏览器前记录 PID，使启动未完成时也能清理；无需人工临时脚本。启动也受 Playwright 15 秒时限约束。字体等待、截图和关闭均有界；字体缺失会影响真实外观，须配置实际所需字体。SIGKILL、宿主崩溃或系统 PID 资源耗尽可能阻止清理代码运行，需操作者维护后重跑，不可将清理视为验收通过。此前尝试出现过 PID 资源耗尽，操作者清理属于维护；已冻结成功/失败观察继续保留，本入口通过不撤销旧失败，也不证明所有故障恢复路径均已验证。下载、系统库、浏览器、缓存及临时文件均不得放入 `/work`。

本次删除描述的浏览器验收使用修改前实际页面副本对照，两种视口均通过，允许删除段落后的图片窗自然上移。结果、前后截图及原生命令观测保存在 [当前验收目录](evidence/.devdesk/baf8d48c-517e-ea55-8eb6-2aaa0544a97d/browser-final/result.json)。图片使用可控 SVG 素材，未验证 CDN 可用性；独立 Green 和冻结三文件回归仍由平台执行。

## 历史验收记录（以下为此前版本）

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

本次目标语言 title 更新的真实浏览器结果见 `evidence/.devdesk/7f8b0ebe-1ef7-3104-f480-5c95cbfe3c48/title-verified/result.json`，原始命令观测同目录保存。使用修改前真实页面副本比较，320/1280 两种宽度布局及截图一致；鼠标、键盘、24组往返和两种状态刷新通过。以上旧轮次记录仍属历史。

## 图片窗

欢迎页下方固定展示5张风景照片，上一张/下一张双向循环。点击图片覆盖浏览视口，再次点击恢复原尺寸、位置、滚动和焦点；支持按钮的 Enter/空格操作及 Escape 退出。展开时隐藏切换按钮，图片始终完整等比适配。加载失败可切换后重试，刷新恢复第一张。无自动播放，不需要 API 密钥。

照片选自 [Pexels](https://www.pexels.com/zh-cn/)，按 [Pexels 许可](https://www.pexels.com/license/) 使用。固定顺序如下：

| 图片 | 作者 | 资源地址 |
| --- | --- | --- |
| [湖水倒映着群山和树林](https://www.pexels.com/photo/lake-and-mountain-417074/) | James Wheeler | [HTTPS 图片](https://images.pexels.com/photos/417074/pexels-photo-417074.jpeg?auto=compress&cs=tinysrgb&w=1920) |
| [行人走在绿色森林的小径中](https://www.pexels.com/photo/person-walking-between-green-forest-trees-15286/) | Luis del Río | [HTTPS 图片](https://images.pexels.com/photos/15286/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=1920) |
| [云雾环绕的雪山](https://www.pexels.com/photo/landscape-photography-of-mountains-covered-in-snow-691668/) | eberhard grossgasteiger | [HTTPS 图片](https://images.pexels.com/photos/691668/pexels-photo-691668.jpeg?auto=compress&cs=tinysrgb&w=1920) |
| [白雪覆盖的山峰](https://www.pexels.com/photo/landscape-photography-of-snowy-mountain-1366919/) | eberhard grossgasteiger | [HTTPS 图片](https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&w=1920) |
| [暮光中的层叠山峦](https://www.pexels.com/photo/scenic-view-of-mountains-during-dawn-1261728/) | Stephan Seeber | [HTTPS 图片](https://images.pexels.com/photos/1261728/pexels-photo-1261728.jpeg?auto=compress&cs=tinysrgb&w=1920) |

图片窗正式断言由 `test/language-hint.test.cjs` 引入 `test/gallery.test.cjs`，因此冻结三文件回归也会执行新断言；浏览器入口同时覆盖320/1280宽度的布局、展开还原及故障恢复。

浏览器图片窗验收默认拦截 CDN 请求并返回有横竖比例的 SVG 测试图片，以稳定复现加载失败；不据此宣称真实 CDN 可用。可将本页5张实际 JPEG 预先下载至 runtime 下，命名为 `<照片ID>.jpg`，然后设置 `BROWSER_IMAGE_DIRECTORY` 使用实际照片（入口会记录每张文件的 SHA-256）。该目录及下载不进入源码；截图与结果请通过 `BROWSER_OUTPUT` 放入当前 Task 的 `evidence/.devdesk/140e9e7b-5742-f990-1d4f-1bedd673a8e0/`。例：

```sh
BROWSER_IMAGE_DIRECTORY=/tmp/devdesk-runtime/gallery-images \
BROWSER_OUTPUT=/work/evidence/.devdesk/140e9e7b-5742-f990-1d4f-1bedd673a8e0/browser-final \
node test/browser-acceptance.cjs
```

图片资源15286使用 Pexels 详情页的 `photos/15286/pexels-photo.jpg` 地址，其余使用各自编号的 JPEG 地址；不能统一推导文件名。资源服务可能暂时拒绝或中断请求，页面会显示失败并允许继续切换。

加载中也可展开图片；当前加载失败时自动退出展开，恢复原尺寸、滚动位置和焦点，显示失败提示与切换按钮。过期请求的回调不会影响当前展开状态。

定向修复正式测试命令：`node --test test/gallery.test.cjs`。浏览器入口在两个视口以可控预加载回调覆盖“加载中→展开→失败→恢复→切换成功”，并检查过期 load/error 不关闭新展开；真实图片元素及布局仍使用实际页面。当前 Task 的浏览器输出应设置为 `evidence/.devdesk/140e9e7b-5742-f990-1d4f-1bedd673a8e0/` 下的新目录。


本次整页语言切换的浏览器验收通过 320×720、1280×720 两种视口，覆盖整页文字、鼠标与键盘、连续往返、刷新、展开状态下切换及失败恢复。结果和截图见 [本 Task 验收结果](evidence/.devdesk/140e9e7b-5742-f990-1d4f-1bedd673a8e0/browser-final/result.json)，同目录保存原生命令观测。使用可控 SVG 图片，未核验真实 CDN 可用性；未请求历史页面布局比较。
