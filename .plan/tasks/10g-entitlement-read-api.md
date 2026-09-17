# 10g · 双池摘要与学生余额列表API

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[10a](10a-balance-service.md)、[02a](02a-membership-date.md)、[01b](01b-package-schema.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第2、7节。无需通读其他任务正文。

## 唯一目标

只提供课时管理所需的授权只读数据。

## 修改入口

packages/api/src/workflow/entitlements.controller.ts、entitlements.dto.ts、entitlements.service.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

GET /api/entitlements?q=&studentId=&page=&pageSize=与GET /api/students/:id/entitlements；返回本人学生双池摘要、类别及本人可见firstPurchasedAt。

## 实现边界

只负责人Admin；列表包含无流水零余额学生，name/id稳定排序，分页与计数、余额/占用按同一RepeatableRead快照读取。权限先于明细；接口不接受excludedParticipantId。Teacher或非负责人直接ID拒绝，不通过studentId筛选扩大scope。

## 不在本任务中

不查逐笔流水、不提供写接口或前端。

## 完成检查

无流水零余额、分页/搜索、并发读取快照、Teacher/他人Admin拒绝、总数一致；OpenAPI同步。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增仅本人学生摘要与分页列表；零流水、过滤、身份、两池及并发同快照验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
