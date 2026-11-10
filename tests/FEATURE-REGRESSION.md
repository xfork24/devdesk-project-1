# Feature 完整回归配方

## 现场与来源

本次为 Workflow `c6e8bd10-e042-4ddc-afbb-609f513f7aa7` 的 `/release_recipe`，Feature `95739419-d59c-40e9-be2a-59e22599fda3`。采用本次直接提供的工程上下文、独立测试与 TDD、Feature 与候选验证 Skill 及 Feature 完整验收规范。

冻结需求来源 `requirements.result`（输出 `54eb8cd7-8f21-4beb-be24-5d639625b369`）；设计来源 `design.result`（输出 `c173bdf2-ec41-44fa-858b-97a54799141d`）；工程约束输出 `00e1393e-c4d1-4217-9d2c-28669e741afe`。固定 Task 集合只有 `57a493fb-8d99-4e4f-acaf-df2dfdfc979d`，本次通过 `implementation.result` 输出 `0bd1a1a1-ba17-4aa0-a015-528be46a5dfd` 提供其交付及证据。没有其他 Task 间接口。

Feature workspace 输入输出 `42d9d0de-7130-46c8-9410-623d60453146` 声明修订 `e3f2f91cd54f275e11fd5dc3b8f269f0888595bb`。输入候选来源 operation `dd70f9eb-8f3d-4b5a-8541-ebafbad36207` 将其关联到源 `e69875dff1fefe9d992f3e930d374ed07336c7fa` 和目标/父修订 `f738440e43b4c479d720e00bead49b5cd6066349`。这些关联来自冻结输入，不是本节点独立执行 Git 的结果。

实际目录为 `/work`；检索排除受保护元数据和 node_modules，发现源码、开发测试及 Task 独立测试。未发现 AGENTS.md。实际读取三个 JS 文件，摘要与 Task 最终快照完全一致；没有接口或路径冲突。现有 `tests/README.md` 是早期 Task 测试节点的历史记录，其中模块缺失及“功能未知”描述不代表当前现场；原文保留。本节点只新增 `tests` 下 Feature 测试、本文和本地执行记录；未修改实现、既有测试或 Git 元数据，未检查私有运行状态。

## 入口与运行

实际公开接口为 `src/parity.mjs` 的 ESM 具名导出 `classifyParity(value)`。调用返回同步字符串：原始 number 整数位于 [-1000000, 1000000] 时返回“偶数”或“奇数”，其余返回“输入无效”。不解析字符串。无效输入后可立即重试有效值，无须清理。使用示例：

```js
import { classifyParity } from '../src/parity.mjs';
classifyParity('2'); // '输入无效'
classifyParity(2);   // '偶数'
classifyParity(-3);  // '奇数'
```

完整命令（目录 `/work`）：

```sh
node --test test/parity.test.mjs tests/parity.test.mjs tests/feature-parity.test.mjs
```

TestRecipe：runner `node_test`，files 按上面三个路径列出，timeout_seconds `30`；无需指定镜像。采用 Node 内置 `node:test`、`node:assert/strict`，ESM `.mjs`，不安装依赖、不使用其他解释器或外部服务。实测 Node 为 v24.13.0；其他 Node 版本未验证。测试直接静态导入真实接口；加载、语法、导出或依赖错误保留为工程故障，不捕获并改装成业务 Red。

## 覆盖及归属

所有行为归属于上述唯一 Task，实现位置 `src/parity.mjs:1`。原开发套件 7 项和独立 Task 套件 62 项全部保留。新 Feature 套件 4 项从调用方完整流程验证同一入口：

| AC | Task 覆盖 | Feature 新增覆盖 |
| --- | --- | --- |
| AC-001 | signed integers | caller journey；every accepted integer：以连续偶奇数对逐值验证全部 2000001 个有效整数，期望不复用实现的取余表达式 |
| AC-002 | signed zero | caller journey 中 +0/-0，以及完整整数区间中的零 |
| AC-003 | closed bounds / closed interval | transitions across both interval endpoints：越界→端点→邻近小数→内侧整数→越界→有效恢复；完整整数区间 |
| AC-004 | invalid input、missing argument、conversion hooks、Proxy | caller journey 拒绝非法值及缺参；端点内侧小数；interleaved callers 拒绝带抛错转换钩子的冻结对象且钩子计数为零 |
| AC-005 | numeric semantics | caller journey 中 2.0、NaN、正负 Infinity 及每次后续有效调用 |
| AC-006 | repeat/recover、caller-owned collections | caller journey；interleaved callers：两组输入交错三轮，逐次断言结果、数组不变、负零保留及无转换 |
| AC-007 | 输入 evidence.runs 1→2、3→4 的真实增量 Red/Green，runs 5、6 最终回归 | 本节点仅补全回归和完整配方，不制造新 Red，不用本地通过结果替代历史 TDD |

每个 Feature 测试无需外部准备和清理，使用显式输入/期望和真实同步调用。场景错误直接报告原始断言或异常；无效请求恢复在同一测试中继续验证。完整整数区间测试覆盖所有有效值，但非法 JS 值仍采用代表性类别，不宣称穷尽所有对象。

输入 Task 证据记录两轮相同测试内容由业务失败转为通过；首轮占位函数可调用但返回 undefined，第二轮基础取余实现未满足校验。输入 candidate_tests operation `ab939e36-0db0-40ad-b484-22a32d84b287` 报告旧候选 62/62 通过，只作为既有 Task 证据引用，不证明本次新增 Feature 套件已获平台验证。输入 review/candidate_review 均通过，未提供待修复的问题列表；本节点未发现需修改产品的行为缺陷。

## 本地实际验证与后续边界

本地执行完整命令，退出码 0；73 项全部通过，失败、跳过、取消、todo 均为 0，stderr 为空。完整 stdout、命令、Node 版本、UTC 起止时间、源码及三个测试的 SHA-256 保存在 `tests/release-local-run.json`。新测试摘要为 `1c6c95f5f508b885e9aefb9c80420016fb9351ffbdb71d83306a3c3204230db9`；既有三文件摘要与输入证据一致，见该记录。

本次是原生命令实测，非平台 tests.run 回执。新增文件使当前内容区别于输入修订，记录明确仅将 SHA 标为冻结输入声明；未独立确认 HEAD、完整工作树差异、最终候选或父关系。后续协调器应固定包含新测试的代码版本并运行本配方，取得与该版本关联的平台结果，然后进行相应评审；本节点不宣称这已发生。

本 Feature 没有 UI、CLI、服务、权限、持久化、跨 Task 集成或外部失败恢复场景，不增加这些产品范围。源码静态读取未发现 I/O、共享可变状态或输入保存；测试不证明所有可能运行环境、内存保留或进程中断性质。没有执行网络调用、推进或合入，无待恢复外部副作用；其他 writer 和资源释放状态未自行检查。本步骤完成的是独立 Feature 回归与完整配方交付，不能单独等同于整个发布流程完成。
