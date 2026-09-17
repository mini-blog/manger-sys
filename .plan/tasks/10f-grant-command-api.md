# 10f · 新增课时HTTP命令

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[10b](10b-trial-grants.md)、[10c](10c-custom-purchase.md)、[10e](10e-package-purchase.md)、[00a](00a-shared-contracts.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第5节。无需通读其他任务正文。

## 唯一目标

只把三种发放方式通过同一个受控命令开放。

## 修改入口

packages/api/src/workflow/entitlements.controller.ts、entitlements.dto.ts；packages/api/src/workflow/entitlements.service.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/entitlements/grants的三种互斥body及response严格按11第5节；返回entry/balances/membershipCategory/firstPurchasedAt/closedTaskIds。

## 实现边界

Cookie/CSRF、负责人Admin、Idempotency-Key；TRIAL+quantity、REGULAR/CUSTOM+quantity、REGULAR/PACKAGE+packageId/expectedPackageVersion。拒绝无关字段、null模式、客户端kind/价格/时间/快照；PACKAGE不得quantity。用Commands：authorize只验证对象权限，成功收据查找先于套餐当前状态验证；业务分派置于action。sourceKey带用户/操作/键，所有发放及receipt同事务。用独立DTO/oneOf及运行时互斥校验，不假设TS union能校验JSON。

## 不在本任务中

不重新实现发放领域逻辑、不建页面。

## 完成检查

三个分支、参数污染、他人学生/Teacher、无CSRF、同键同body重放、改body409、套餐变更后的已成功重放、失败后无成功收据；同步OpenAPI。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增互斥DTO/运行时Pipe及OpenAPI oneOf；三种发放、CSRF/归属、幂等和套餐停用后成功重放验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
