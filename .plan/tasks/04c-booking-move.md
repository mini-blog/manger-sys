# 04c · 同科目原子换课

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[04e](04e-booking-restore.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3节。无需通读其他任务正文。

## 唯一目标

只把已占用的席位原子移动到另一节同科目课程。

## 修改入口

packages/api/src/workflow/teaching.service.ts(participantAction move)。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/participants/:id/move {expectedVersion,reason,targetSessionId}。

## 实现边界

旧行必须未来BOOKED/PENDING，目标未来、同科目、无已提交反馈，kind不变。校验余额时只排除旧行自身占用；目标已有效拒绝，目标取消行仅在kind一致且无出勤时恢复。目标通过后旧行取消→目标新建/恢复→双向ScheduleChange及来源任务处理；净占用不变。任何失败保留旧位、旧占用与旧任务，不先提交取消。

## 不在本任务中

不增加跨科目换课、随意改变参与类型或前端。

## 完成检查

available=0但旧占用可换；目标满/冲突/异科目/异kind失败全不变；并发换课、重试不重复目标。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
