# 01b · 预设套餐及历史快照字段

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[01a](01a-ledger-schema.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第1节。无需通读其他任务正文。

## 唯一目标

只增加套餐目录和流水的套餐来源结构。

## 修改入口

packages/api/prisma/schema.prisma；新增migration。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

LessonPackage{id,name,quantity,priceAudCents,active,version,createdAt,updatedAt}；EntitlementEntry增加packageId?/packageSnapshot?。

## 实现边界

quantity为1..10000整数、priceAudCents正整数AUD分、version>=1。关联与快照同时为空或同时有值，只有REGULAR/PURCHASE可带套餐；外键禁止删除已引用套餐。快照固定name/quantity/priceAudCents/currency=AUD/version；跨表数量匹配由10e事务执行。

## 不在本任务中

不做套餐CRUD/API、价格引擎或发放。

## 完成检查

PG约束拒绝孤立快照、非购课套餐来源、无效数量/价格、删除已引用套餐；普通购课无套餐仍合法。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增LessonPackage及流水套餐快照迁移；PG数量/价格/版本、关联配对及引用删除约束验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
