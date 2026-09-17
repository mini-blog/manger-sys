# 02b · 学生创建可选赠课API

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[10b](10b-trial-grants.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第6节。无需通读其他任务正文。

## 唯一目标

只改建档命令与资料更新白名单。

## 修改入口

packages/api/src/workflow/students.service.ts、dto.ts、controller.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/students新增giftTrialCredit?:boolean，省略true、false不赠；保持原成功response最小形状。PATCH不接受赠课字段。

## 实现边界

创建学生、可选INITIAL_TRIAL +1、receipt同事务，owner取当前Admin。拒绝null/字符串/数字布尔及initialTrialHours/quantity/firstPurchasedAt/firstEnrolledOn。拆开可编辑StudentFields与Create专有字段，不能继续用PartialType(Create)把gift带进PATCH。移除旧日期写入和相应资料更新校验，保留联系方式/沟通服务。对语义变化的创建operation使用新版本命名，保留旧收据，不清表。

## 不在本任务中

不实现三Tab、列表分类、课时弹窗或购课。

## 完成检查

默认/true一条固定1；false无流水且后续可追加；非法字段400，编辑补赠被拒，重试只一生一赠课，任何失败全回滚。同步OpenAPI。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

创建DTO拆出赠课指令，缺省true/false保留；编辑拒绝赠课与旧日期；students:create:v2/update:v2保留旧收据，事务/权限/重试验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
