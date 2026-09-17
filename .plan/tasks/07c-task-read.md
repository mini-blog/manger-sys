# 07c · 任务查询的目的与关联字段

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[01c](01c-workflow-schema.md)、[02a](02a-membership-date.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第2、5节。无需通读其他任务正文。

## 唯一目标

只让既有任务查询返回权益版的正确跟进上下文。

## 修改入口

packages/api/src/workflow/read.service.ts(taskDto/task/tasks)、dto.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

TaskDto/TaskDetailDto增加purpose、resolvedByEntitlementEntryId、rebookedToParticipantId、membershipCategory与studentVersion；精确学生版本只在本人Admin详情提供。

## 实现边界

保留reason来源事件、来源快照、可用时间与due排序，不能用当前课次信息覆盖发生时快照。会员类别在服务端同一读取快照推导，closed FIRST_PURCHASE也返回当前真实会员状态。所有Task仍assignee本人；只返回授权引用摘要，不通过entry/task ID泄漏他人。

## 不在本任务中

不改任务写入或页面。

## 完成检查

Teacher/他人Admin直接ID拒绝；购课已关闭来源显示原因，来源改时不漂移；purpose与reason不同字段。同步OpenAPI。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
