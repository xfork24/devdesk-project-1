# 独立集成断言范围与实际观察

Task：33f51d37-ad03-02e6-527b-87355c5ac56b，Feature：20cb9ab2-4fb3-a7af-b5f5-b61c200e0b71。
冻结代码版本：860918202ee280b966a30c902f74e10f562d5c28。
来源：execution-input:e5d2764c-9733-0a74-fcf4-107541514408:task、execution-input:e5d2764c-9733-0a74-fcf4-107541514408:design、execution-input:e5d2764c-9733-0a74-fcf4-107541514408:test_configuration、execution-input:e5d2764c-9733-0a74-fcf4-107541514408:workspace。
应用 simplified-spec-tests:1 与 simplified-skill-test-design:2，执行器为冻结 node_test。

断言执行服务工厂 /work/server.cjs 和实际 HTTP 返回的页面及脚本；../../../server.cjs 从本目录解析到 /work/server.cjs。模块已存在，interfaces 为空。page.cjs 是独立最小 DOM 执行环境，图片加载由替身完成，HTTP、CSRF token 获取、文件存储和 API 错误来自实际服务。只注入捕获器以生成有效 PNG 或可重复错误，未调用 macOS 系统捕获。故障仅施加于系统临时目录，不改源码。每项有超时，清理页面计时器、HTTP 连接、服务和临时存储。

I01 对应 AC-02-03-05-06 的可重复集成部分：两次保存、读取图片与磁盘文件、重新执行页面、关闭并重新创建服务读取存储、定向删除后再次创建服务。服务工厂重新创建证明存储重新打开，不等同于真实后台进程重启或浏览器刷新验收。
I02 对应 AC-01-04-07：Tab 切换、图片展开还原、滚动焦点恢复、全局语言与真实异步保存结果、欢迎图片节点保留。
I03/I04 对应以上两组 AC 的失败链路：取消、捕获拒绝替身、超时、坏 PNG、真实磁盘阻塞、损坏历史、删除失败、连接失败、保留旧历史、恢复后重试及不自动重试 POST。

2026-11-22 原生试跑最终结果：4 tests / 4 pass / 0 fail / 0 cancelled / 0 skipped，exitCode=0，status=completed。命令为 node --test tests/.devdesk/33f51d37-ad03-02e6-527b-87355c5ac56b/integration.test.cjs，cwd=/work。原生操作 exec-dd274a70-d941-4ba3-9e7e-77ef5b168f70，startedAtMs=1795363863369，completedAtMs=1795363863870；完整观察：/run/devdesk/command-output/7a1055ad05e7ac12067a7556322715d55dd530496b2b2c11f700f638220766d2.json。首次试跑的缺少 closest 方法属于测试助手错误，修复后通过，不是业务 Red。当前断言已在基线通过，请经理调整验证安排，不能人为制造 Red。上述原生命令不是平台独立 Red/Green 回执。

未覆盖及后续责任：真实 Mac 框选、非浏览器桌面内容、系统参数与取消行为、权限拒绝、实际系统版本、后台进程重启及文件事实，仍须真实 Mac 原始证据及独立评审。真实浏览器布局、键盘和浏览器安全策略由维护中的 test/browser-acceptance.cjs 验收。本轮读取了该入口与 test/page.cjs；前者仍为 file URL，后者尚不执行外部脚本。集成实现负责维护两者和正式集成用例；独立断言未复制正式用例，也未改上游断言。DELIVERY 的 README 启动、环境、权限重启、存储恢复说明、正式测试发现关系、冻结三文件与 gallery 引入关系、实际并行平台记录，交独立评审和平台完整回归核验；本步骤不宣称这些已通过。项目回归保持冻结 180 秒，独立配方 60 秒。当前 Linux 环境不替代 Mac 验收。
