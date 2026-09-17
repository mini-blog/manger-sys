# 06a · 课后反馈的消费与任务事务

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[10a](10a-balance-service.md)、[07a](07a-followup-policy.md)、[04d](04d-roster-read.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第4节。无需通读其他任务正文。

## 唯一目标

只在既有完整反馈事务内加入不可重复的扣课与会员快照。

## 修改入口

packages/api/src/workflow/teaching.service.ts(feedback)。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/sessions/:id/feedback保持expectedVersion/summary/students DTO；反馈内容hash沿用。

## 实现边界

仅分配老师在endsAt后提交全部BOOKED成员。锁内先核对占用，ATTENDED追加对应池唯一-1 CONSUMPTION，NO_SHOW仅释放；写出勤/反馈及按课次日的标签快照、完成老师Task，并调用07a为TRIAL建销售/回访/重约任务。保留正式生已有可选个人反馈，不宣称其尚未实现。相同规范化payload在状态/version拒绝前识别已提交结果，异payload409；空名单可完成，无Admin任务。

## 不在本任务中

不改反馈页面布局、购课接口或纠错入口。

## 完成检查

双池扣减、漏名单/他课/提前/缺试听反馈拒绝；换键同内容不双扣、异内容不能覆盖；购课前后两种并发顺序；故障全回滚。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
