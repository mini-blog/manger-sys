# 07b · 人工跟进与重开写接口

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[07a](07a-followup-policy.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第5节、00重约规则。无需通读其他任务正文。

## 唯一目标

只移除人工报名赋权并定义按来源重开的条件。

## 修改入口

packages/api/src/workflow/tasks.service.ts、dto.ts；packages/common/src/index.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

follow-up沿用正文结构，outcome=NO_ANSWER/CONSIDERING/INTERESTED/NOT_INTERESTED/RESOLVED；reopen沿用expectedVersion/reason/nextDueAt。

## 实现边界

前3者OPEN+未来时间；NOT_INTERESTED关闭需原因，RESOLVED仅MEMBER_CARE/REBOOKING。拒绝ENROLLED/firstEnrolledOn写入，独立沟通outcome也不可新写ENROLLED，历史展示不改。reopen只本人DONE/CANCELLED、来源当前有效且未被有效重约替代；不得用同科目任意PENDING作为否决条件。会员不得重开FIRST_PURCHASE。任务与日志同事务；并发购课后旧version拒绝。

## 不在本任务中

不发课、不改UI、不删除已登记历史日期。

## 完成检查

有意向不变会员；会员回访可解决、重约可关闭；同科目另一独立试听不阻止合法重开，有有效关联目标则阻止；历史日志仍可读；OpenAPI同步。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
