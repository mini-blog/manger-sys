# 04e · 恢复同一课次的取消预约

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[04b](04b-booking-cancel.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3节。无需通读其他任务正文。

## 唯一目标

只恢复原参与记录，重新取得本池占用。

## 修改入口

packages/api/src/workflow/teaching.service.ts(participantAction restore)。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/participants/:id/restore {expectedVersion,reason}，成功ActionDto。

## 实现边界

本人学生原行CANCELLED/PENDING、课未开始且未提交反馈，保留kind；使用04a共享资格重验联系人/会员/余额/冲突/容量。只关闭本来源OPEN/REBOOKING并关联恢复的参与行，日志/任务/占用/receipt同事务。

## 不在本任务中

不重建一条参与行，不取消或移动其他预约。

## 完成检查

取消后余额被其他课占用则恢复失败；重复恢复、改kind、历史已出勤拒绝；失败仍取消、无新增流水。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
