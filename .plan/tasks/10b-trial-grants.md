# 10b · 初始赠送与追加试听写入原语

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[10a](10a-balance-service.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第1、6节。无需通读其他任务正文。

## 唯一目标

只提供供外层事务调用的两种试听发放方法。

## 修改入口

packages/api/src/workflow/entitlements.service.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

initialTrialGrant(tx,studentId,actorId,sourceKey,now)固定+1；grantTrial(tx,studentId,quantity,note,actorId,sourceKey,now)为TRIAL_GRANT。

## 实现边界

数量1..10000整数。两者都不改会员日期、不操作Task、不自动预约。方法不嵌套Commands或自己commit，创建学生/发放API的外层事务负责权限、幂等和收据；初始来源键与student稳定关联。

## 不在本任务中

不接建档DTO、不新增HTTP、不做正式发放。

## 完成检查

固定1与追加3流水正确；初始重复唯一拒绝使外层回滚；不变firstPurchasedAt和任务；不同合法来源允许追加。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

实现固定初始赠1及手动追加试听原语；数量边界、唯一赠送、失败回滚及身份不变验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
