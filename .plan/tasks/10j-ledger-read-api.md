# 10j · 课时流水只读分页API

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[10g](10g-entitlement-read-api.md)、[01b](01b-package-schema.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第2、7节。无需通读其他任务正文。

## 唯一目标

只提供某学生的只读课时流水。

## 修改入口

packages/api/src/workflow/entitlements.controller.ts、entitlements.dto.ts、entitlements.service.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

GET /api/students/:id/entitlement-entries?bucket=&page=&pageSize=；按createdAt/id倒序。

## 实现边界

先校验负责人Admin；返回entryId/bucket/kind/quantity/time/actor摘要/note/packageSnapshot和可授权来源课次，不附带他人联系方式或教师私人Task。套餐展示历史快照，不join当前值覆盖历史；计数/列表同快照，分页1–100。

## 不在本任务中

不重新算余额、不写或删流水、不做页面。

## 完成检查

空流水、两池过滤、同时间稳定分页、套餐变更后历史不变、越权403；OpenAPI同步。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增只读流水分页、池过滤、作者摘要和历史套餐快照；实际字段为id/createdAt，稳定排序与越权验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
