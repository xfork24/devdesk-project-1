# 独立键盘行为断言

Task e14cc71d-4ada-ae1f-d3cc-2e4f96abb65d；基线 7fc6873ec23fcc221574072c38012d613d32d6b4。
冻结来源：execution-input:1427f72d-c1e2-1c6f-986d-e4df7c3265f6:task、:design、:test_configuration、:workspace（workspace 原产物 6f179f0b-cd91-1bcf-0627-59e8a2e77d23）。技能 simplified-skill-test-design:2，规范 simplified-spec-tests:1；runtime_context.repair_history 为空。

运行 node --test tests/.devdesk/e14cc71d-4ada-ae1f-d3cc-2e4f96abb65d/navigation.test.cjs；仅依赖 Node 内置模块。辅助文件从 __dirname 的 ../../.. 解析 /work，读取实际 index.html 和 public/screenshots.js，执行完整生产脚本，不导入正式测试或私有 runtime 模块。无新增业务模块，interfaces 为空。

AC-1 检查欢迎页两种状态的连续双向切换、至少三张不同目标及焦点。AC-2 检查截图两种状态的四向目标、展开转移、本地化标签、退出后焦点和滚动恢复；注入多列、单列、缺位及与 DOM 次序不同的矩形，并在按键间更新布局。AC-3 检查首尾不循环、缺位、单图及空集。AC-4 检查其他控件、失焦时向旧图片发送事件、再次聚焦，以及非对应方向键。

欢迎页固定五图输入经原鼠标按钮观察顺序；单图/空图夹具仅替换 photos 数据。空图省略一次初始化 show()，避免把初始化访问 photos[0] 的异常混作导航 Red；其余脚本（包括按键处理）原样执行。空图只验证普通态；空集合不存在可展示的放大图片，不声称验证空图初始化或空图展开。截图空集通过真实历史加载路径进入。夹具不模拟浏览器默认动作，defaultPrevented 仅核验页面是否消费按键。

最小 DOM 只能证明给定布局输入的行为，不能证明 CSS、真实焦点和槽位稳定。实现者仍须维护 test/gallery.test.cjs、test/screenshots-ui.test.cjs、test/browser-acceptance.cjs，保留鼠标循环，并用既有浏览器入口验证窄屏、多列、不完整末行、放大槽位及调整视口后的真实布局；冻结三文件项目回归仍由平台执行。缺布局/移除中节点及网络故障不单列为本配方覆盖，原有恢复行为由正式测试与评审核对。

本步骤只执行语法及夹具检查，原生命令 exit=0；检查了路径解析、脚本加载、五条记录、矩形、点击/Escape 及空输入夹具。未运行本配方的业务断言，未产生平台 Red/Green 或回归回执。平台必须分类实际失败；依赖、加载、语法或夹具异常均不得算有效 Red，已有通过也不得算 Red。
