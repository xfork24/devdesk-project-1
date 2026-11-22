# 独立 UI 验证

Task frontend（97da92c1-c50f-15b8-9252-a6b0a63bc19c），基线 88a4c56fe6164dd6dfc9354f325f21002328f9ea。冻结来源为 execution-input:ec36bc43-8f2f-681f-1c1c-fc6fa0fd2537:task、:design、:test_configuration、:workspace；具体值及摘要由本轮输入保存。使用 simplified-spec-tests:1、simplified-skill-test-design:2。唯一断言入口 ui.test.cjs，不修改正式项目测试或共享入口。

运行前需 Node >=22 和 jsdom 26.1.0，后者位于 ${DEVDESK_RUNTIME_DIR:-/tmp/devdesk-runtime}/node/node_modules/jsdom。本轮通过 npm install --prefix /tmp/devdesk-runtime/node jsdom@26.1.0 --no-audit --no-fund 安装并核对版本；新运行环境必须先恢复同一依赖。依赖缺失、脚本加载或执行错误属于环境/装载失败，不能用作业务 Red。配方 node_test，超时 60 秒。

测试执行实际 index.html 及其同源本地脚本，API 为固定响应；按可见按钮文字/可访问名称定位欢迎、截图、捕获、删除和重试。Tab 面板通过 aria-controls 或 role=tabpanel 定位。记录通过冻结 API 图片 URL 定位，不规定截图模块函数导出，故 interfaces 为空。测试替身不实现产品业务。资源禁止向外网加载，欢迎图片预加载替身完成回调。

覆盖 AC-01 导航及欢迎图片窗兼容；AC-03 多记录、去重、空历史、全新页面重载、失败保留与重试；AC-04 缩放往返、Tab 退出、滚动焦点与记录不变；AC-05-06-07-UI 定向删除、失败保留、展开删除、请求锁、UUID、取消、成功、七类错误、网络失败不自动重试，以及跨 Tab、进行中和异步完成时的全局语言。

本轮原生语法检查通过；仅运行 AC-01 基线探针，页面及脚本成功加载后，在“截图 Tab 可见”业务断言失败（原生命令 chunk 678a86，exit 1）。该观察只验证测试装载和基线缺失行为，不是平台 Red 回执，也未执行完整配方或宣称 Green。原生观察由平台在 /run/devdesk/command-output 保留。ROOT 路径计算核对为 /work。

边界：DOM 环境不证明真实布局、键盘原生行为或 Mac 桌面捕获；真实后台持久化、系统权限、截图尺寸、磁盘恢复和浏览器集成由 backend/integration 任务及真实 Mac 验收负责。正式 test/screenshots-ui.test.cjs、冻结三文件回归和既有 gallery 引入关系由项目实现、独立评审与平台回归核对。本目录不可由实现者改写。
