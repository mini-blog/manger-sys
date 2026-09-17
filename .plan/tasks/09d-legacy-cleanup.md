# 09d · 旧资格接口与旧写契约退役

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[05a](05a-booking-ui.md)、[02d](02d-student-form-ui.md)、[02e](02e-student-tabs-ui.md)、[02f](02f-student-detail-ui.md)、[07d](07d-followup-ui.md)、[08b](08b-ai-stale-response.md)、[03a](03a-session-commands.md)、[03b](03b-session-cancel.md)、[06a](06a-feedback-command.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[共同约定](../00-contracts.md)的版本上线约定。无需通读其他任务正文。

## 唯一目标

只清理权益版已无消费者的旧接口和资格判断。

## 修改入口

packages/api/src/workflow/controller.ts、dto.ts、read.service.ts、students.service.ts、teaching.service.ts、tasks.service.ts；packages/common/src/index.ts；受影响现有测试。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

删除trial-eligibility端点/DTO/前端引用；停止firstEnrolledOn和ENROLLED新写及其身份判断，旧数据库列/日志仍保留。

## 实现边界

检索所有有效调用点后清理，不删除历史记录/收据。语义改变的Commands.operation使用明确新版名称，避免旧成功收据被新版同路径重放；历史反馈hash保护继续保留。更新旧测试为新语义，不能只删失败测试；生成OpenAPI并检查web/api/common同时可编译。

## 不在本任务中

不迁移生产数据、不收紧旧库约束、不删除历史列。

## 完成检查

无残留旧资格API消费者，无旧日期授予权益，旧接口返回不存在；pnpm check/test/build通过，新增接口生成类型一致。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
