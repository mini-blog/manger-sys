# 04b · 取消单个预约

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[04a](04a-booking-create.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3节。无需通读其他任务正文。

## 唯一目标

只取消一个未来预约并释放占用。

## 修改入口

packages/api/src/workflow/teaching.service.ts(participantAction cancel/restore)。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/participants/:id/cancel沿用expectedVersion/reason和ActionDto。

## 实现边界

只允许本人学生未来BOOKED/PENDING预约。写CANCELLED释放占用，不新增余额流水；试听创建本来源REBOOKING。ScheduleChange/Task/version/receipt同事务，不触碰其他同科目任务。

## 不在本任务中

不做恢复、换课或整课取消。

## 完成检查

取消不增余额，其他预约占用不变；重复键重放、旧version、已开始或已反馈拒绝；失败回滚。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
