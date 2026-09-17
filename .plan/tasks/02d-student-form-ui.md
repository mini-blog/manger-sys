# 02d · 学生表单可选赠课

- 类型：开发；范围：后续权益版本；状态：已实现，待页面验收（2026-09-17）。
- 前置任务：[02b](02b-student-create-api.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第6–7节。无需通读其他任务正文。

## 唯一目标

只改建档/编辑表单，移除旧日期输入。

## 修改入口

packages/web/src/pages/Students.tsx、StudentDetail.tsx。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

新增Checkbox默认true发送giftTrialCredit布尔；编辑请求无该字段且无firstEnrolledOn。

## 实现边界

保留姓名/年级/联系人/意愿，旁边仅“1节”短说明，不加数量框。false明确发送，失败保留选择；沿用useWrite同正文重试键，成功清表单。详情旧日期可以作为历史只读资料，但不能当会员。

## 不在本任务中

不做三Tab、余额卡片或课时新增弹窗。

## 完成检查

默认选中、取消勾选、保存失败/重试、编辑无赠送项；抓请求验证字段并与API联调。pnpm check及页面检查。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

Students新增默认true的赠课Checkbox，请求和重试签名明确包含布尔值；成功后恢复true。StudentDetail移除旧日期编辑，仅保留历史只读说明。`pnpm check`及`pnpm build`通过；建档API联调在隔离PG通过。浏览器默认勾选/失败输入保留/编辑请求抓取尚未验收，本任务暂不标完成。见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。
