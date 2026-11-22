# Red 覆盖返工审计

本轮来源：execution-input:4054d7c3-be6f-4fe6-f01d-d7e17b402816:task、:design、:test_configuration、:workspace（均使用同一完整前缀）。Task 33f51d37-ad03-02e6-527b-87355c5ac56b；固定候选 0a24213f7566415fb782b4fd6bba3f461a1b111b。采用 simplified-spec-tests:1、simplified-skill-test-design:2。

已完整读取平台 tests.run 回执 79dcf78b-b161-6b7f-8a0e-33bfa260c8ae，value_digest=f5966631af5101a2101fcbf8521fccd86f8f5f064c885080928e5455253db732。操作 969b8aab-ff62-bd7b-c2ad-871b9a672ac5；候选与上述版本一致，镜像 sha256:cfdd13360965d846cf746bf829782d65247e5cb8e986c71271124f908e09673d；4 tests、4 passed、0 failed/cancelled/skipped，exit_code=0、status=succeeded，timed_out=false。其 recipe 为 node_test、integration.test.cjs、60 秒。该结果是通过事实，不能作为 Red。

审计 I01–I04 与服务、页面脚本及维护中的验收入口：I01 检查两次保存、真实 HTTP 图片与磁盘内容、页面重新执行、服务重建和定向删除持久化；I02 检查 Tab、截图展开还原、滚动焦点和共享语言异步结果；I03/I04 检查取消、替身权限错误、超时、无效 PNG、磁盘阻塞、历史损坏、删除和网络故障后的历史保留与恢复。未建立本 Task 范围内可重复且尚未满足的业务缺口，因此未新增断言。用例 ID、expected、acceptance、interfaces 及 recipe 全部保留。

尚未证明：真实 Mac 的系统命令参数、取消、非浏览器桌面区域及图片尺寸、权限拒绝、实际系统与后台进程重启；当前替身和服务重建不覆盖这些事实。最小 DOM 不证明浏览器布局、键盘及安全策略。README、正式测试发现关系与实际并行调度由实现、独立评审和平台回归负责；现有 README 仍描述静态启动，维护入口仍使用 file URL，不能把这些交付缺口改写为行为 Red。

建议经理保留原成功回执及真实 Red 门禁，核对集成 Task 开始前前后端行为已经交付的时序，安排符合冻结范围的后续验证，并为真实 Mac 验收提供可执行环境与原始证据。不得撤销门禁或以此审计宣称业务验收完成。原断言无需重复执行来证明同一平台通过事实；本轮只进行了源码覆盖审计与接口路径核对。
