# 独立 UI 验证

Task frontend（97da92c1-c50f-15b8-9252-a6b0a63bc19c），基线 88a4c56fe6164dd6dfc9354f325f21002328f9ea。冻结来源为 execution-input:ec36bc43-8f2f-681f-1c1c-fc6fa0fd2537:task、:design、:test_configuration、:workspace；具体值及摘要由本轮输入保存。使用 simplified-spec-tests:1、simplified-skill-test-design:2。唯一断言入口 ui.test.cjs，不修改正式项目测试或共享入口。

运行前需 Node >=22、npm 及 npm registry 网络访问。jsdom 26.1.0 的精确依赖图由同目录 package.json/package-lock.json 声明；dependency.cjs 在每个独立测试进程中创建系统临时目录，复制清单后执行 npm ci（禁用安装脚本、最多45秒），仅从该临时安装加载并检查版本，进程结束清理。无需预存作者会话依赖或共享缓存，源目录保持只读；安装失败明确分类为环境错误。原配方 node_test、唯一选择 ui.test.cjs、60秒超时不变。

测试执行实际 index.html 及其同源本地脚本，API 为固定响应；按可见按钮文字/可访问名称定位欢迎、截图、捕获、删除和重试。Tab 面板通过 aria-controls 或 role=tabpanel 定位。记录通过冻结 API 图片 URL 定位，不规定截图模块函数导出，故 interfaces 为空。测试替身不实现产品业务。资源禁止向外网加载，欢迎图片预加载替身完成回调。

覆盖 AC-01 导航及欢迎图片窗兼容；AC-03 多记录、去重、空历史、全新页面重载、失败保留与重试；AC-04 缩放往返、Tab 退出、滚动焦点与记录不变；AC-05-06-07-UI 定向删除、失败保留、展开删除、请求锁、UUID、取消、成功、七类错误、网络失败不自动重试，以及跨 Tab、进行中和异步完成时的全局语言。

本轮原生语法检查通过；仅运行 AC-01 基线探针，页面及脚本成功加载后，在“截图 Tab 可见”业务断言失败（原生命令 chunk 678a86，exit 1）。该观察只验证测试装载和基线缺失行为，不是平台 Red 回执，也未执行完整配方或宣称 Green。原生观察由平台在 /run/devdesk/command-output 保留。ROOT 路径计算核对为 /work。

边界：DOM 环境不证明真实布局、键盘原生行为或 Mac 桌面捕获；真实后台持久化、系统权限、截图尺寸、磁盘恢复和浏览器集成由 backend/integration 任务及真实 Mac 验收负责。正式 test/screenshots-ui.test.cjs、冻结三文件回归和既有 gallery 引入关系由项目实现、独立评审与平台回归核对。本目录不可由实现者改写。


## 隔离依赖返工

本轮冻结来源 execution-input:42ec45cc-920b-9947-e4b5-72297aa1520d 的 task、design、test_configuration、workspace，输入代码版本 044b1bf504e861e5b351a98f4b69867898345462。按已转交原失败报告 6c59afd7-d6f0-9d61-f685-f1eb75f556e7 的 runtime_context.independent_test_failure 修复：原失败为 MODULE_NOT_FOUND，属于环境失败。尝试按报告 ID 读取原件被平台以读取范围限制拒绝，未据此宣称取得额外原件。仅替换测试的依赖加载表达式及增加安装支撑、清单与锁文件；全部业务用例、预期、接口与原配方保留。上文旧轮次原生观察只属于历史。

本轮原生核对：两个 CJS 语法检查通过；全新临时依赖安装后仅运行 AC-01 探针，耗时15322ms，页面脚本加载通过，随后在 visible control /^(截图|Screenshots?)$/i 业务断言失败（command chunk ff8cf7，exit=1）。未执行完整配方，未宣称平台 Red/Green。锁文件中 jsdom=26.1.0、全部依赖完整性字段及源目录无 node_modules 已核对；临时目录退出清理由支撑负责。
