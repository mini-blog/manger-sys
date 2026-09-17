# 10e · 套餐购课事务原语

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[10c](10c-custom-purchase.md)、[01b](01b-package-schema.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第1、5节。无需通读其他任务正文。

## 唯一目标

只实现用服务器套餐数据完成一次正式购课。

## 修改入口

packages/api/src/workflow/entitlements.service.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

grantPackagePurchase(tx,{studentId,packageId,expectedPackageVersion,note,actorId,sourceKey,now})；数量不可由客户端指定。

## 实现边界

事务内读active/version：不存在404，停用或版本不匹配409；复制名称、数量、AUD分价、币种、version到快照，与packageId一起写PURCHASE。复用10c内部购课核心，避免先自定义发课后再补快照的两次提交。套餐目录变化不回写历史。

## 不在本任务中

不做批量多份套餐、优惠或API。

## 完成检查

精确发套餐数量、首次身份与关单同事务；停用/版本过期失败无流水；改价/停用后历史快照不变。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

套餐服务端数量/版本/有效状态校验；保存历史快照，改价停用不回写；正式发放统一复用purchase核心。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
