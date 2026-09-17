# 10d · 有效套餐只读查询API

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[01b](01b-package-schema.md)、[00a](00a-shared-contracts.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第7节。无需通读其他任务正文。

## 唯一目标

只让Admin获得有效套餐下拉数据。

## 修改入口

新增packages/api/src/workflow/entitlements.controller.ts及entitlements.dto.ts；packages/api/src/app.module.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

GET /api/lesson-packages?q=&page=&pageSize=→{items,total,page,pageSize}；item为id/name/quantity/priceAudCents/currency:AUD/version。

## 实现边界

Cookie认证+Admin校验，默认只active，name/id稳定排序，q<=80、page>=1、pageSize1..100。无记录返回空列表；查询与计数同快照。不开放套餐维护接口。同步Swagger和pnpm openapi:generate。

## 不在本任务中

不seed、不发课、不做前端。

## 完成检查

Admin分页/搜索/空列表、Teacher403、未登录401；停用项不返回，金额为整数分。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增Admin只读有效套餐查询，权限/搜索/空列表、AUD分价和Swagger验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
