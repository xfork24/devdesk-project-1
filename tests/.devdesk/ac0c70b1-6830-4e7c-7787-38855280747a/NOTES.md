# 独立断言范围

Task ac0c70b1-6830-4e7c-7787-38855280747a，基线 a8f0fa281801938a9246fe6a71c7d32c91a984c2；冻结来源 execution-input:e90a89ac-52bf-ceca-d169-efeacec4c08d:task、:design、:test_configuration、:workspace（后三者同完整前缀）。遵循 simplified-spec-tests:1 和 simplified-skill-test-design:2。

node_test 执行 gallery.test.cjs，辅助 page-harness.cjs 仅模拟 DOM、事件和可控图片加载，不实现画廊业务。读取路径由三层父目录解析到 /work/index.html。没有新增业务模块，因此 interfaces 为空。展开通过语义属性或展开类观察，不绑定具体类名；若实现以其他 DOM 状态表达，测试作者应核对等价行为后维护观察器，不能将模拟器缺失能力当业务 Red。

AC-1 初始内容和按钮、AC-2 五图顺序及双向循环、AC-3/4 每张图重复展开还原和后续切换、异常加载/失败/恢复/快速切换旧回调及缺节点安全退出由独立断言覆盖。模拟事件避免依赖真实图片网络；不验证 Pexels 服务可用性。图片详情页、作者、固定5张的来源与 README 外部资源说明由独立评审核对。正式测试接入与完整回归由实现者和平台负责。真实比例、360px/720px框、视口覆盖、占位、按钮可见性、滚动位置、焦点恢复和原生键盘激活由 test/browser-acceptance.cjs 在320/1280宽度核验，VM 不提供布局证据。

原生语法检查成功。首次原生执行暴露测试路径计算错误，修正后执行为6项、1通过、5断言失败，失败为基线缺 gallery DOM；没有导入或运行环境失败。原生 commandExecution 由 /run/devdesk/command-output 保存，命令观察 chunk c93eba；这不是 tests.run 平台回执。缺节点兼容在基线已经通过，不能单独算有效 Red。平台尚须执行冻结配方获得独立 Red/Green；完整业务断言和浏览器结果尚未知。
