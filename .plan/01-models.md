# 01 · 模型、迁移与种子（分组索引）

**这不是可直接执行的任务。** 原文件同时包含数据库扩展、核对、导入和seed；拆开后三种风险不混在一次修改中。每次只选择下列一个叶子任务，先完成其前置；不得以“完成本分组”为由顺带实现全部文件。

范围：后续权益版本；进度见下表，[阶段验收](../docs/ENTITLEMENT-MILESTONE.md)记录已完成的局部验证，不代表整版已发布。

| 任务 | 单一交付 | 状态 |
| --- | --- | --- |
| [01a](tasks/01a-ledger-schema.md) | 课时流水的数据库约束 | 已完成 |
| [01b](tasks/01b-package-schema.md) | 预设套餐及历史快照字段 | 已完成 |
| [01c](tasks/01c-workflow-schema.md) | 待办目的与会员标签字段 | 已完成 |
| [01d](tasks/01d-migration-preflight.md) | 旧数据只读预检与核对文件 | 待执行 |
| [01e](tasks/01e-migration-import.md) | 核对数据的幂等导入 | 待执行 |
| [01f](tasks/01f-demo-seed.md) | 权益版幂等演示种子 | 待执行 |

规则统一见[共同约定](00-contracts.md)及[参考细则](11-implementation-details.md)；全局依赖和代码核对结果见[总索引](README.md)与[检查记录](AUDIT.md)。
