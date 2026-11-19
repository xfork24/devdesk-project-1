# 独立测试范围与实际观察

Task be7c68cb-9bf0-40b1-5808-5c26aab1e3f0，基线 revision 2fa40391bbd69d5546f80ea2a7b15987450b5aa1。冻结来源 execution-input:897f3781-2b4b-a185-ce4f-b87f4552eec9 的 task、design、test_configuration、workspace 端口；规范 simplified-spec-tests:1，技能 simplified-skill-test-design:2。independent_runner 为 node_test，regression 为 null。

运行入口：node --test tests/.devdesk/be7c68cb-9bf0-40b1-5808-5c26aab1e3f0/welcome.test.cjs；超时 30 秒。页面解析目标经原生命令断言为 /work/index.html。无新增业务模块，interfaces 为空。

四项测试对应 AC-1 初始中文与刷新恢复、AC-2 二十次即时双向点击和目标语言文字、AC-3 原 h1/title/lang 保留；检查原节点身份、元素数量、既存节点 click 监听注册次数、fetch/XHR 及 location 方法调用。此 DOM 模拟无布局引擎，无法穷尽浏览器网络、导航或动态节点监听行为。浏览器即时视觉效果、键盘与焦点、右上角及窄视口不遮挡、其他原内容与交互由独立评审核验；README 入口、正式测试补充和既有断言保留由独立评审及平台按冻结配置核对。上述责任未删除，未声明通过。

辅助库来自 https://unpkg.com/basichtml@2.4.9/web.js，版本 2.4.9，SHA-256 a6ffdd3ec9c2cdf35b7dd35f0c2fad2bb7be39251b316f04f67096328d5dc812；许可证为 vendor/LICENSE。执行不需要联网或安装。事件使用该库原生 dispatchEvent 可接受的记录，覆盖真实页面内联脚本；DOM 生命周期与 defaultView 由辅助装载器提供。辅助库不等同完整浏览器。

原生执行报告如下；这些是 commandExecution 观察，不是平台 tests.run 回执。早期路径与辅助库装载错误均已修正，不计为有效 Red。最终基线中原标题已通过，该通过仅覆盖保留行为；三项新增业务断言失败，正式 Red/Green 由平台执行。合成页面只验证测试辅助设施能完成四项断言，未写入 index.html，不是产品 Green。

[
  {
    "kind": "baseline_native",
    "file": "/run/devdesk/command-output/28a6eb5cabd035a582d6ea5ad8d1f0fc7692d8e0ce85bedc18f45f8669aad359.json",
    "id": "exec-92e2fe1d-6cde-4231-9367-0839d620037b",
    "exitCode": 1,
    "status": "failed",
    "result": "4 tests: 1 pass, 3 assertion failures; no skipped/cancelled; exit 1"
  },
  {
    "kind": "synthetic_harness_check",
    "file": "/run/devdesk/command-output/3339e77650033dad470afd3cba48ab65e7af9eeb4d84a126687c3b005d97bc3d.json",
    "id": "exec-b6c34751-877b-4898-bc60-6909324946e4",
    "exitCode": 0,
    "status": "completed",
    "result": "4 tests pass on an in-memory synthetic page; does not validate production behavior"
  }
]
