# 10a · 双课时池余额服务

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[01a](01a-ledger-schema.md)、[00a](00a-shared-contracts.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第1节。无需通读其他任务正文。

## 唯一目标

只提供同快照余额读取及事务内可用量校验。

## 修改入口

新增packages/api/src/workflow/entitlements.service.ts；packages/api/src/app.module.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

getBalances(tx,studentId)→{TRIAL:{remaining,reserved,available},REGULAR:{...}}；assertAvailable(tx,studentId,bucket,required=1,excludedParticipantId?)。

## 实现边界

remaining=sum(quantity)，reserved=有效BOOKED/PENDING参与数；过期未反馈也占用。无流水返回0。排除旧参与仅供换课/恢复内部使用，必须校验学生/池/状态，不接受客户端任意排除ID。可用不足409 ENTITLEMENT_INSUFFICIENT；不静默截断负余额，负数视为迁移/数据异常。权限由调用端先检查。

## 不在本任务中

不提供HTTP、不存余额缓存、不发放或消费。

## 完成检查

两池独立、空余额、取消/NO_SHOW不占用、过期占用、换课排除自身但不能排除别人；真实PG同快照检查。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

事务内双池聚合及可用量校验；过期占用、取消/未到释放、非法排除、负可用异常和RepeatableRead验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
