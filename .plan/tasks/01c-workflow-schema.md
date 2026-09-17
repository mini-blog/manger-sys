# 01c · 待办目的与会员标签字段

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[01a](01a-ledger-schema.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第1、4节。无需通读其他任务正文。

## 唯一目标

只扩展任务联动与历史标签的可空字段，兼容旧库。

## 修改入口

packages/api/prisma/schema.prisma；新增migration。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

Task.purpose? FIRST_PURCHASE/MEMBER_CARE/REBOOKING、resolvedByEntitlementEntryId?、rebookedToParticipantId?；Participant.membershipCategorySnapshot?。

## 实现边界

保留原Task两个来源唯一索引；新增外键并禁止引用历史被误删。扩展阶段允许旧Admin任务purpose为空，Teacher必须空；PURCHASE关联及重约目标的跨学生/科目校验由Service完成。只有01e完成核对、业务切换后09c才加Admin purpose必填约束，不能第一步使旧代码无法写入。

## 不在本任务中

不回填、不生成或关闭任务。

## 完成检查

旧库迁移通过、原任务不改；无效枚举/外键拒绝，旧空purpose与Teacher空purpose可保留。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增可空Task.purpose/解决关联与名单会员快照；旧Task逐字段不变，非法目的/外键和Teacher非空purpose被拒。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
