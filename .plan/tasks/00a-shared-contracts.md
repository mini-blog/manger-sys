# 00a · 共享权益枚举与类型

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[01a](01a-ledger-schema.md)、[01b](01b-package-schema.md)、[01c](01c-workflow-schema.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；无需另读11。无需通读其他任务正文。

## 唯一目标

前后端共用一套新增枚举，保持已有API能编译。

## 修改入口

packages/common/src/index.ts；packages/api/test/shared-contracts.test.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

新增课时池/流水类型、membershipCategory、TaskPurpose及CUSTOM/PACKAGE常量和纯类型；新增后续跟进结果常量包含RESOLVED。

## 实现边界

common不依赖Prisma/Nest/React。不要提前删除原FOLLOW_UP_OUTCOMES中的ENROLLED导致现有代码报错；07b/09d切换写契约后删除旧可写引用，历史日志仍允许字符串展示。OpenAPI生成类型仍由各HTTP任务生成，不复制DTO到common。

## 不在本任务中

不实现分类算法、业务服务或手改生成类型。

## 完成检查

共享值与Prisma枚举一致；pnpm --filter @student/common build及pnpm check通过，原页面不受破坏。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增共享权益、会员、待办及购课常量/类型；保留旧跟进枚举，枚举与Prisma契约测试通过。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
