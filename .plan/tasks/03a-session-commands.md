# 03a · 课次改时与替课适配

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[04b](04b-booking-cancel.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3–4节。无需通读其他任务正文。

## 唯一目标

只使现有课次修改兼容权益版身份。

## 修改入口

packages/api/src/workflow/teaching.service.ts(update/teacherTask)。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

沿用PATCH /api/sessions/:id及confirmedAffectedParticipantIds。

## 实现边界

移除基于旧firstEnrolledOn的正式生校验；保留未来限制、教师/班级/全体BOOKED学生半开冲突、容量和影响集合检查。有参与历史不得改科目/班级。改时不扣课/发课，Teacher Task同步assignee/availableAt/dueAt；变更记录同事务。

## 不在本任务中

不取消整课，不改课次新增和预约流程。

## 完成检查

旧确认集409，改时/替课冲突阻止；替课旧老师失权，新老师接手；改时不改变课时流水及占用。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
