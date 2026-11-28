# 实现阶段验证清单 · Task d5280b56-c4ff-dde3-59e2-c80634ea7298

工作区 `eac9919c-4614-1858-8ac3-6d3c3232dd87`，基线 `e3eedd89f2d5e9271890bb7e79f121f98c4dd076`。
本文件属于流程材料，只保留在 Task/Feature 分支，不进入最终代码 PR。

## 交付文件（AC-09 范围）

| 文件 | 改动 |
| --- | --- |
| `public/screenshots.js` | `messages.*.empty` 改为带 `{capture}` 占位符的模板；新增纯函数 `emptyGuide()`；`render()` 空状态分支改用 `emptyGuide()` |
| `test/screenshots-ui.test.cjs` | 追加 8 个正式回归用例（既有 8 个用例与共享辅助 `open`/`settle`/`deferred` 未改动） |

`index.html`、`server.cjs`、`backend/*`、`test/` 其它文件、`tests/` 独立断言目录均未改动。

## 本步骤实际执行的检查

| 检查 | 方式 | 结果 |
| --- | --- | --- |
| 中文指引码点逐字核对 | ripgrep 显式码点 `\x{6682}…\x{3002}`（21 码点） | 仅命中 `test/screenshots-ui.test.cjs:125` 的 `GUIDE_ZH`，与独立断言 `GUIDE_ZH` 同码点 |
| 英文指引引号码点核对 | ripgrep `No screenshots yet\. Select \x{201c}(Capture region\|\{capture\})\x{201d} to create your first screenshot\.` | 命中 `public/screenshots.js:25` 与 `test/screenshots-ui.test.cjs:126` |
| 错误态文案码点核对 | ripgrep `\x{5386}\x{53f2}\x{52a0}\x{8f7d}\x{5931}\x{8d25}\x{ff1a}…\x{3002}` | 命中 `test/screenshots-ui.test.cjs:128`，与独立断言 `ERROR_ZH` 同码点；源文件 `historyError` + `STORAGE_FAILED` 两段拼接结果一致 |
| 旧文案已移除 | ripgrep `暂无截图'\|No screenshots yet'` | 无匹配，旧的空状态字面量不再存在 |
| 改动面 | ripgrep + 逐文件阅读 | 仅 `public/screenshots.js`、`test/screenshots-ui.test.cjs` 改动 |

## 未能执行的检查（原因与影响）

本步骤的 shell 执行被冻结权限拒绝，以下命令均未运行，无命令回执：

- `ls -la /work`、`pwd`、`node --version` → 同一拒绝信息：`The frozen DevDesk Permission denies this tool or path.`
- `tool_search`（查询可执行工具）同样被拒绝，故无替代执行通道。

影响：

1. `node --test tests/welcome.test.cjs test/*.test.cjs`（冻结七文件回归）未在本步骤执行，须由平台在固定实现版本后执行并保存回执（AC-10）。
2. 同一份独立断言在基线上的业务 Red 已有平台回执（`tests.run`，exit 1，5 failed / 4 passed，assertion 分类）；实现后的 Green 须由平台用同一断言文件在同一 `public/screenshots.js` 版本上执行（AC-11）。
3. `node test/browser-acceptance.cjs` 未执行；该入口会记录 `public/screenshots.js` 的 SHA-256 身份，本次源文件已变更，旧身份记录失效，须重跑刷新（设计 R4 / AC-07 补充验收）。
4. `test/screenshots-ui.test.cjs` 的语法与运行结果未在本步骤取得本地回执，须由冻结回归覆盖（该文件依赖私有 runtime 的 jsdom@26.1.0，路径按 README 配置）。
