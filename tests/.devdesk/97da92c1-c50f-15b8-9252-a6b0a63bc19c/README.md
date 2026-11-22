# 独立 UI 验证

Task frontend（97da92c1-c50f-15b8-9252-a6b0a63bc19c），基线 88a4c56fe6164dd6dfc9354f325f21002328f9ea。冻结来源为 execution-input:ec36bc43-8f2f-681f-1c1c-fc6fa0fd2537:task、:design、:test_configuration、:workspace；具体值及摘要由本轮输入保存。使用 simplified-spec-tests:1、simplified-skill-test-design:2。唯一断言入口 ui.test.cjs，不修改正式项目测试或共享入口。

运行前需 Node >=22。dependency.cjs 仅从 ${DEVDESK_RUNTIME_CACHE:-/tmp/devdesk-runtime/shared}/frontend-jsdom-26.1.0 加载预置 jsdom 26.1.0，并检查锁文件 SHA-256 一致；测试进程不执行 npm、不访问网络、不写源码。平台必须将按本目录 package.json/package-lock.json 预置的该依赖目录只读挂载到独立容器。依赖安装及缓存仅位于源码外，不进入 Git。挂载或依赖缺失属于环境失败。原配方 node_test、唯一选择 ui.test.cjs、60秒超时不变。

测试执行实际 index.html 及其同源本地脚本，API 为固定响应；按可见按钮文字/可访问名称定位欢迎、截图、捕获、删除和重试。Tab 面板通过 aria-controls 或 role=tabpanel 定位。记录通过冻结 API 图片 URL 定位，不规定截图模块函数导出，故 interfaces 为空。测试替身不实现产品业务。资源禁止向外网加载，欢迎图片预加载替身完成回调。

覆盖 AC-01 导航及欢迎图片窗兼容；AC-03 多记录、去重、空历史、全新页面重载、失败保留与重试；AC-04 缩放往返、Tab 退出、滚动焦点与记录不变；AC-05-06-07-UI 定向删除、失败保留、展开删除、请求锁、UUID、取消、成功、七类错误、网络失败不自动重试，以及跨 Tab、进行中和异步完成时的全局语言。

本轮原生语法检查通过；仅运行 AC-01 基线探针，页面及脚本成功加载后，在“截图 Tab 可见”业务断言失败（原生命令 chunk 678a86，exit 1）。该观察只验证测试装载和基线缺失行为，不是平台 Red 回执，也未执行完整配方或宣称 Green。原生观察由平台在 /run/devdesk/command-output 保留。ROOT 路径计算核对为 /work。

边界：DOM 环境不证明真实布局、键盘原生行为或 Mac 桌面捕获；真实后台持久化、系统权限、截图尺寸、磁盘恢复和浏览器集成由 backend/integration 任务及真实 Mac 验收负责。正式 test/screenshots-ui.test.cjs、冻结三文件回归和既有 gallery 引入关系由项目实现、独立评审与平台回归核对。本目录不可由实现者改写。


## 隔离依赖返工

本轮冻结来源 execution-input:42ec45cc-920b-9947-e4b5-72297aa1520d 的 task、design、test_configuration、workspace，输入代码版本 044b1bf504e861e5b351a98f4b69867898345462。按已转交原失败报告 6c59afd7-d6f0-9d61-f685-f1eb75f556e7 的 runtime_context.independent_test_failure 修复：原失败为 MODULE_NOT_FOUND，属于环境失败。尝试按报告 ID 读取原件被平台以读取范围限制拒绝，未据此宣称取得额外原件。仅替换测试的依赖加载表达式及增加安装支撑、清单与锁文件；全部业务用例、预期、接口与原配方保留。上文旧轮次原生观察只属于历史。

本轮原生核对：两个 CJS 语法检查通过；全新临时依赖安装后仅运行 AC-01 探针，耗时15322ms，页面脚本加载通过，随后在 visible control /^(截图|Screenshots?)$/i 业务断言失败（command chunk ff8cf7，exit=1）。未执行完整配方，未宣称平台 Red/Green。锁文件中 jsdom=26.1.0、全部依赖完整性字段及源目录无 node_modules 已核对；临时目录退出清理由支撑负责。


## 离线加载返工（第3轮）

冻结来源 execution-input:a98b395d-135d-2a5e-8806-c2aad49dea02 的 task、design、test_configuration、workspace；输入代码 a605ea72641d35fd175b08c170a94c6305d2b7ce。原报告 16d25bd7-4cef-de4e-5ec9-b5cf6a231f18 的独立读取被平台范围限制拒绝，诊断依据本轮转交的 runtime_context.independent_test_failure：禁网容器 npm ci 失败，未进入业务断言。

本轮只修改 dependency.cjs 和本说明；ui.test.cjs、清单、锁文件、全部 cases、interfaces=[] 与60秒配方保持原样。已按冻结锁在共享路径预置39个依赖，原生命令 chunk c0cc25 安装完成 exit=0，dependency.cjs 语法检查通过（aabef0）。该安装不证明平台独立容器有挂载。当前没有获准调用可验证或修改独立容器挂载的工具，需经理将上述预置目录纳入固定镜像或只读共享挂载，再由平台按原配方执行。禁止以作者会话安装成功作为环境已修复或平台 Red 的证据。

本轮原生 AC-01 探针（chunk 07a79d）实际结果：exit=1，tests=1、pass=0、fail=1、cancelled=0、skipped=0，耗时3120.461085ms；依赖及页面脚本加载成功，业务断言 visible control /^(截图|Screenshots?)$/i 失败。仅验证本会话离线加载路径与基线缺失行为；未运行完整配方，未取得平台独立 Red/Green。

## 第3轮续交（sequence 2）

本轮 supplemental_input（origin=technical_recovery）确认固定镜像 sha256:cfdd13360965d846cf746bf829782d65247e5cb8e986c71271124f908e09673d 的禁网、只读共享挂载可读取预置 jsdom 26.1.0，锁文件与本 Task 相同，CommandTests 和 Harness 共用 DockerSandbox 挂载。该事实来自转交技术确认，不是本作者取得的平台测试回执；此前挂载待确认限制据此解除。

保留现有离线加载修复，本次仅补记说明。原生核对 chunk 1ef13a、exit=0：ui.test.cjs 语法通过；dependency.cjs 成功加载 JSDOM；两份锁 SHA-256 均为 5ffd066923402dff2aad2c3798649215c08bb77a1ab9bcd7c495e6168de259b5；ui.test.cjs SHA-256 为 5a0bece69d03dc6911474056c5ad49f2e773eff6d2d395356470fca1b03f4fe2。未重复业务探针或完整配方，未宣称平台 Red/Green；平台继续封存现有修改并执行原冻结配方。全部 cases、预期、interfaces=[]、唯一选择 ui.test.cjs、node_test 和60秒超时不变。
