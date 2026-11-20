# 语言提示关联验收

Task：19fe7521-2a56-3b7a-1f7a-482b09b3e3d1。本轮冻结依据为 execution-input:0710e6a1-d322-561f-a623-452a85118185 的 task、design、recipe、red、workspace、test_configuration；恢复快照输出 6d2f5b93-decc-8e21-dde9-b4fac20014cf 已完整读取，版本 5a92bd5e6bce20f5d4144221d5f567c1e9cdf69f。

恢复源码已在 index.html 的 language-toggle 按钮上静态添加 aria-describedby="language-hint"，本轮保持该实现。文案、脚本、CSS 和节点保持原状；未修改正式或独立测试。正式测试扩展由后续独立 Tester 负责。

## 浏览器原生执行

Chromium 145.0.7632.0，Playwright 1.58.2，Linux aarch64；外层冻结镜像 sha256:cfdd13360965d846cf746bf829782d65247e5cb8e986c71271124f908e09673d。浏览器、依赖、字体配置、缓存、基线 HTML 和临时脚本均位于 /tmp/devdesk-runtime。

在 /work 执行的命令以 FONTCONFIG_FILE 和 LD_LIBRARY_PATH 指定私有字体及系统库，运行 `timeout --kill-after=5s 90s node /tmp/devdesk-runtime/browser-recovery.cjs`。完整命令、原始 stdout/stderr、session/thread/turn、起止时间及退出事实保存在 recovery-browser-observation.json，原样复制自 /run/devdesk/command-output/b8ab51f4d3b0a2e4e41cb7701fd7046079bcdfe7c3c0fab51ee235fa249da8fa.json，SHA-256 为 3c22f2fb7a76cc7bdec0d0c9a8ca78c8f3a83401296d56fbea9efb9b19e449f2。

操作 exec-1125608a-568a-424d-8b77-c431e29a2abd；开始 1795133461876、完成 1795133469000（Unix ms），退出码 0，status=completed；没有触发 timeout。脚本逐页执行，并在 finally 关闭 page/browser。

实际打开 file:///work/index.html，SHA-256 为 352e34fcd4a5193f44327d085461ae8c49c539bfccf7886f010d63b6d47bf525。比较基线只移除新增属性，其 Git blob c6eaf9f4beb3541998362c73f56fb12168382515 与冻结差异的原文件一致，SHA-256 为 20a98d1a14e130dc3dfd2423d36a3152c5b053121202bf3c5b40831a95fb81f8。

320×720、1280×720 两种视口均通过：初始中文；鼠标切英文；刷新恢复中文；Tab 聚焦按钮；Enter 切英文；Space 切中文；24 次逐次往返核对三处文案及 lang；中文状态刷新恢复中文。每个状态均验证精确关联、目标唯一及同一提示节点复用。初始基线与修改后各元素边界及字体一致，截图文件也逐字节相同。

截图：recovery-baseline-320.png、recovery-updated-320.png（各 12043 字节）；recovery-baseline-1280.png、recovery-updated-1280.png（各 15436 字节）。本轮新增观测及截图约 66 KB。旧截图及观测未覆盖；此前失败尝试及恢复事实仍以冻结恢复材料为准，本次成功不撤销此前失败。

## 测试与限制

真实平台 Red 来源 execution-input:0710e6a1-d322-561f-a623-452a85118185:red，operation aacc3533-5484-51ef-b625-f773f465aa67，candidate f661950d8fcd8a12c3661b4bc7415d78d81f203a：4 项均因缺少关联属性发生业务断言失败，exit=1、expected_failure=true，非环境错误。当前独立测试 SHA-256 仍为 15b4649b4854bc6e964d06e2a2f49b1b5a0a5151b3776d20ffc7090deb833ee7，与冻结快照一致。

本轮浏览器执行是原生观测，不是 tests.run 平台回执。本轮未重复运行平台负责的 Green 或三文件回归；原有 node-observation.json 也不替代平台 Green。正式测试扩展、确切最终版本 Green、Task/Feature 源与合并候选三文件回归、独立评审、真实 Human 签核及 Git 合入同步仍由对应步骤执行。本说明只完成本实施步骤，不声明整个 Feature 完成。流程证据留在本 Task 目录，最终代码 PR 的排除由平台协调者处理。
