# 05b · 名单和教师反馈的会员标签

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[04d](04d-roster-read.md)、[06a](06a-feedback-command.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第4、6节。无需通读其他任务正文。

## 唯一目标

只更新共用名单及老师反馈表单中的标签显示。

## 修改入口

packages/web/src/components/Roster.tsx；packages/web/src/pages/TaskDetail.tsx(FeedbackForm)。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

主category=TRIAL/NEW/EXISTING；可选membershipCategory显示新会员/会员，旧null快照不猜测。

## 实现边界

TRIAL始终置顶且有明显试听标签，会员辅助标签不覆盖Trial。Teacher显示相同授权数据，不取权益明细；学生页类型不反向覆盖本课历史标签。保留现有完整名单出勤表单、正式可选反馈、summary和loading/error。

## 不在本任务中

不改表单提交业务或增加第三种身份字段。

## 完成检查

Trial+New member、Trial+Member、购课前历史课、旧快照、Teacher反馈后标签稳定；正式可选反馈仍正常。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
