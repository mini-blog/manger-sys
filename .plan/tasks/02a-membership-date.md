# 02a · 墨尔本会员分类纯函数

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[00a](00a-shared-contracts.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第6节。无需通读其他任务正文。

## 唯一目标

用一个服务端算法计算会员类别与查询日期边界。

## 修改入口

新增packages/api/src/workflow/membership.ts；新增packages/api/test/membership.test.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

输入firstPurchasedAt|null及referenceInstant；输出TRIAL_STUDENT/NEW_MEMBER/MEMBER、Melbourne参考日及nextMidnight。另提供列表可用的日期筛选边界。

## 实现边界

首次购课当地日d至d+6为NEW_MEMBER，d+7起MEMBER；无购课或参考课次日早于d为TRIAL_STUDENT。7日按日历日，不按168小时；与余额无关。调用者传Clock的同一个时间，不在函数内部多次new Date。

## 不在本任务中

不改学生查询、名单或前端标签。

## 完成检查

第0/6/7日、午夜前后、首次时间当天晚于上课时刻但同日期、参考日早于首次日、DST 167/169小时周。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

membership.ts统一分类及查询日期边界；7个日期情形及DST 167/169小时周验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
