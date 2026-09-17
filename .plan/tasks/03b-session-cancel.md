# 03b · 取消整节课的权益与任务联动

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[04b](04b-booking-cancel.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3–4节。无需通读其他任务正文。

## 唯一目标

只取消一节未来课程，原子释放全班占用。

## 修改入口

packages/api/src/workflow/teaching.service.ts(cancelSession/teacherTask)。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/sessions/:id/cancel保持expectedVersion/reason/confirmedAffectedParticipantIds。

## 实现边界

Admin可取消共享课次；锁内重验未来和完整影响名单。全部BOOKED→CANCELLED，两池占用随之释放，不写退款或赠课；每个TRIAL来源建REBOOKING分配给各自Admin，关闭老师反馈Task，课次状态与日志/receipt同事务。

## 不在本任务中

不允许Teacher代取消、不改时或自动通知家长。

## 完成检查

混合Admin/两池名单均正确释放；每位负责人只见自己的任务；重复请求不增加余额，影响集变化409，任意失败全课回滚。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
