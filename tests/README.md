# 独立奇偶测试配方与执行记录

## 范围与来源

本节点 `/implementation/0/tests` 为任务 `57a493fb-8d99-4e4f-acaf-df2dfdfc979d` 编写独立行为测试，只写入 `tests`。采用提供的“工程上下文与工作树规范”“独立测试与 TDD”和“Feature 与候选验证”方法；不实现产品、不改开发自有的 `test/parity.test.mjs`，不执行 Git 操作。

- 设计：冻结 `inputs.design`，摘要 `a675e0d440e9e3c1f77ec0162bcf1224401f432de940669db1b8349026b51799`。
- 任务：冻结 `inputs.task`，摘要 `8ff2b19b835916921c95c612b2c2a64e392bd9a60808f5d18205a4773dcec555`。
- 工作空间输入输出 ID：`ecd46324-614c-41e6-b422-851d6a2585ed`；workspace/owner `57a493fb-8d99-4e4f-acaf-df2dfdfc979d`。
- 声明基线：`f738440e43b4c479d720e00bead49b5cd6066349`，来自输入，未独立核验 HEAD、父关系或工作树差异；Git 由协调器负责。
- 实际 `pwd` 为 `/work`；排除 `.git`、`.codex`、`.agents` 和 `node_modules` 的文件检索只发现 `.gitignore`（两条命令退出码均为 0）。没有源码或现有测试文件冲突。

## 配方

工作目录 `/work`，runner `node_test`，命令：

```sh
node --test tests/parity.test.mjs
```

超时 30 秒。使用 JavaScript ESM、`node:test` 和 `node:assert/strict`，无第三方依赖、安装、网络或外部服务。静态导入 `../src/parity.mjs` 的具名导出 `classifyParity`。要求该模块可加载且接口可调用；不捕获加载错误，不提供替代实现。

## 覆盖

所有用例均从无业务状态开始，直接调用公开同步接口，严格比较中文结果字符串；表驱动名称标明输入类别。无需外部数据准备或清理。

| 验收 | 输入与操作 | 期望及测试名 |
| --- | --- | --- |
| AC-001 | 正负奇偶整数，包含 ±1、±2、±3 和较大整数 | 精确返回奇数/偶数；`signed integers` |
| AC-002 | +0、-0 | 均为偶数；`signed zero` |
| AC-003 | 两端点、邻近内侧奇偶、外侧整数、远处及安全整数极值 | 闭区间内正确分类，区间外输入无效；`closed interval` |
| AC-004 | 正负小数、近端点小数、极小非零数、字符串、布尔、空值、缺参、集合、包装对象、BigInt、Symbol、函数 | 正常返回输入无效；`invalid input returns normally`、`missing argument` |
| AC-004 | 冻结对象带抛错转换钩子；带读写陷阱的 Proxy | 输入无效，转换和属性读写均不发生；`rejects objects`、`rejects a Proxy` |
| AC-005 | 2.0、NaN、正负无穷、正负最大有限数 | 2.0 为偶数，其余无效；`numeric semantics` |
| AC-006 | 三次重复 3、3、'2'、4，并插入 NaN、-3、-0 | 结果稳定且无效后可恢复；`repeated calls and recovery` |
| AC-006 | 普通对象、数组、Set、Map、冻结对象调用前后比较 | 无修改，后续有效调用正常；`does not modify caller-owned objects or collections` |

本测试为 Task 公开接口的独立行为验证，不替代实现者的增量开发 TDD。AC-007 需要后续核验实现者提供的两个增量原始 Red/Green、版本快照和最终记录，不能从本次加载失败推导。未验证进程中断、I/O 禁止、输入不被保留或全部共享状态实现细节；这些需要代码检查。本功能没有权限系统、网络或持久化恢复流程，不虚构对应测试。

## 本节点实际执行

环境：Node.js v24.13.0（来自实际错误输出）。没有平台回执或候选来源证据可引用；以下是本节点原生命令观测。

1. `node --check tests/parity.test.mjs`，目录 `/work`，退出码 0，无输出，语法检查通过。
2. `sha256sum tests/parity.test.mjs`，退出码 0：`9e15b9eaed183f8031cb2b3ee42590b7c2923b4c9619cbdc32391520c259007f`。
3. `node --test tests/parity.test.mjs`，目录 `/work`，退出码 1，模块加载前置条件失败；未取得业务 Red 或 Green。原始输出如下：

```text
node:internal/modules/esm/resolve:274
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/work/src/parity.mjs' imported from /work/tests/parity.test.mjs
    at finalizeResolution (node:internal/modules/esm/resolve:274:11)
    at moduleResolve (node:internal/modules/esm/resolve:864:10)
    at defaultResolve (node:internal/modules/esm/resolve:990:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:718:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:735:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:764:52)
    at #resolve (node:internal/modules/esm/loader:700:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:620:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:143:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:228:17) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///work/src/parity.mjs'
}

Node.js v24.13.0
✖ tests/parity.test.mjs (37.862167ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44.38375

✖ failing tests:

test at tests/parity.test.mjs:1:1
✖ tests/parity.test.mjs (37.862167ms)
  'test failed'
```

独立测试与配方已准备；功能结果未知。后续 `red_baseline` 应在保持独立断言不变的前提下准备最小可调用接口，再运行相同配方获得真实行为结果。本节点没有产品写入或外部副作用，无待恢复操作；未检查其他 writer 或私有运行状态。最终候选 SHA、来源与验证版本的关联由协调器及后续验证步骤负责。本交付不代表功能通过、AC-007 满足、平台接纳或合入。
