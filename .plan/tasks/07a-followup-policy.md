# 07a · 按来源管理跟进任务的事务原语

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：[01c](01c-workflow-schema.md)、[02a](02a-membership-date.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3–5节。无需通读其他任务正文。

## 唯一目标

把任务目的和来源关联封装成可复用事务方法，避免购课与反馈服务循环依赖。

## 修改入口

新增packages/api/src/workflow/followup-policy.ts；packages/api/src/workflow/teaching.service.ts中原工具函数为迁移入口。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

ensureFollowup(tx,participantId,event,now)、closeFirstPurchase(tx,studentId,entryId,now)、closeRebooking(tx,sourceTaskId,targetParticipantId,now)。均使用调用者事务。

## 实现边界

锁内重读学生会员时间；到课为FIRST_PURCHASE或MEMBER_CARE，未到/取消为REBOOKING。每participant一个Task，课次/学生一致；重开同来源更新快照并清除不再适用的旧解决关联。购课只关该生OPEN/FIRST_PURCHASE。重约只关明确来源OPEN/REBOOKING并保存rebookedToParticipantId，不能按学生+科目批量关闭其他到课销售任务。取消due=nextDay17(now)，到课/未到due=nextDay17(endsAt)。

## 不在本任务中

不开放接口、不改整个TeachingService调用点、不写购课流水。

## 完成检查

同生同科目多个试听来源互不误关；会员分流、重试来源唯一；重约目标跨学生/科目拒绝；历史沟通不变。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增同tx的跟进生成、首次购课关单和明确重约来源处理；跨学生/科目拒绝、重复事件、关单和历史沟通保留验证。尚未替换旧TeachingService调用点，符合本任务边界。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
