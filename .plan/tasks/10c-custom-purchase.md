# 10c · 自定义正式购课事务原语

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[10a](10a-balance-service.md)、[07a](07a-followup-policy.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第5节。无需通读其他任务正文。

## 唯一目标

只实现一笔自定义正式购课及其身份/关单副作用。

## 修改入口

packages/api/src/workflow/entitlements.service.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

grantPurchase(tx,{studentId,quantity,note,actorId,sourceKey,now})→entry与closedTaskIds；入口HTTP由10f负责。

## 实现边界

新增REGULAR/PURCHASE正数流水，无套餐字段。firstPurchasedAt为空才设为同一now并递增Student.version；entry.createdAt显式用同一now避免投影时间偏差。调用07a关闭OPEN/FIRST_PURCHASE并关联该流水。不能改试听余额、关闭重约/回访或伪造沟通。

## 不在本任务中

不做套餐选择、API、页面、付款核验。

## 完成检查

未试听直接购课、续购不重置日期、首次流水时间严格相等；中途故障全部回滚；只关闭正确任务。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

自定义正式PURCHASE、首次日期投影及首次购课待办解决同事务；同一时点、续购、故障回滚和不误关回访验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
