# 本轮浏览器验收

Task：7e828066-1a76-ea46-bccc-1a0973ad44b9。冻结输入为 execution-input:d94f279d-99bb-6238-033f-ea381c14bc41 的 task、design、recipe、red、workspace、test_configuration。实施基线 c658d0275bd81102dceeb050fd8cb0b0589063f8。

被验收 index.html 的 SHA-256 为 `20a98d1a14e130dc3dfd2423d36a3152c5b053121202bf3c5b40831a95fb81f8`；这是页面内容摘要，不是新 Git commit SHA。Git 由协调器管理，最终快照应以此摘要核对页面版本，再关联平台固定的提交。

2026-11-19T17:27:18.568Z 至 17:27:20.263Z，Playwright 1.58.2 驱动 Chromium 145.0.7632.0 实际打开本轮 file:///work/index.html。320×720、1280×720 分别检查初始中文、Tab/Enter 切到英文、英文刷新恢复中文、空格切到英文、Enter 切回中文、中文刷新恢复中文，共12次状态检查通过。检测提示唯一、准确文本与语言、既有欢迎文案和按钮文本、标题、视口内非零布局、无横向溢出、元素互不遮挡及无 pageerror；六张截图见同目录 PNG，逐项测量见 browser-report.json。320px 英文截图已目视确认完整换行、焦点轮廓和无重叠。

执行命令：

```sh
FONTCONFIG_FILE="$DEVDESK_RUNTIME_DIR/fonts.conf" LD_LIBRARY_PATH="$DEVDESK_RUNTIME_CACHE/recovered-8e125841/sysroot/usr/lib/aarch64-linux-gnu:$DEVDESK_RUNTIME_CACHE/recovered-8e125841/sysroot/lib/aarch64-linux-gnu" node evidence/.devdesk/7e828066-1a76-ea46-bccc-1a0973ad44b9/browser-check.cjs
```

cwd=/work；DEVDESK_RUNTIME_DIR=/tmp/devdesk-runtime；DEVDESK_RUNTIME_CACHE=/tmp/devdesk-runtime/shared。浏览器使用 shared/browsers/chromium-1208，字体使用缓存 sysroot 内 Noto CJK，通过运行时 fonts.conf 配置。包安装使用 npm install --prefix "$DEVDESK_RUNTIME_DIR/node" playwright@1.58.2 --no-audit --no-fund。依赖、字体配置及缓存均在工作树外。冻结外层镜像为 sha256:cfdd13360965d846cf746bf829782d65247e5cb8e986c71271124f908e09673d；不将其当作任意嵌套程序的证明。

成功原生命令观察：启动 chunk 882b6a，完成 chunk f9a546，退出码0，stdout/stderr为空；未观察到超时或取消。原始 commandExecution 由平台保存于本步骤 /run/devdesk/command-output。首次两次检查因未配置字体导致欢迎段落零高度而退出1（chunk 530d08、798ff9），修复运行时字体后实际重跑；旧缓存与失败记录没有被当作通过证据。

正式测试原生执行：node --test tests/welcome.test.cjs test/*.test.cjs，Node v24.13.0，cwd=/work，7 tests，7 pass，0 fail/cancelled/skipped/todo，退出码0，观察 chunk 632730。覆盖新增提示初始状态、24次双向切换、全新执行上下文恢复中文，并保留旧兼容测试。它不是平台 tests.run Green 回执。

独立测试文件未修改，SHA-256 仍为 019a0dc672f070cbea4a903862f39fc3d8ae9c88da67c4a2a6bf980669da5312。已消费的平台 Red 为 operation d1176d9c-e7e9-4a20-f006-e072e6318026，在基线 c658d0275bd81102dceeb050fd8cb0b0589063f8 上3项业务断言失败、1项通过，无环境或加载失败。

本轮仅验证 Chromium 上述视口；不推断其他浏览器。回归配置为 null。平台后续固定最终版本并取得独立 Green。本目录为流程证据，按任务要求保留在 Task/Feature 分支，不进入最终代码 PR；源码、README 与 test/ 正式测试正常交付。
