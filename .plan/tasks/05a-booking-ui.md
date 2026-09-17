# 05a · 课次内选人的双池提示

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[04a](04a-booking-create.md)、[04b](04b-booking-cancel.md)、[04c](04c-booking-move.md)、[10g](10g-entitlement-read-api.md)、[10i](10i-grant-dialog.md)、[04e](04e-booking-restore.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3、7节。无需通读其他任务正文。

## 唯一目标

只把名单操作从旧试听资格提示改成双池及明确重约来源。

## 修改入口

packages/web/src/components/Roster.tsx(AddStudent/预约操作)；packages/web/src/pages/StudentDetail.tsx预约跳转。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

选人仍GET /students?mine=true；余额用GET /students/:id/entitlements；重约入口URL携带sourceRebookingTaskId并在add body带回。

## 实现边界

保留已有URL student选人参数，与课时页studentId参数用途区分。TRIAL和REGULAR都按可用量提示，余额不足跳课时管理预选对应池；缺联系人另指档案。无来源的正常预约不自动关任务。换课不能因available=0而禁用已有占用移动，目标失败保留旧名单。

## 不在本任务中

不移除旧后端接口（09c统一清理），不重做课表筛选或名单标签。

## 完成检查

会员用试听、两池不足、恢复重验、0可用换课、重约来源透传、Teacher无编辑、API409保留输入。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
