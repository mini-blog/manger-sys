# 04d · 名单会员标签与教学摘要查询

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[02a](02a-membership-date.md)、[01c](01c-workflow-schema.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第2、6节。无需通读其他任务正文。

## 唯一目标

只统一课表人数摘要、名单及学生教学记录的会员标签。

## 修改入口

packages/api/src/workflow/read.service.ts(lessonDto/participantDto/roster/student)、dto.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

ParticipantDto新增membershipCategory；保留category TRIAL/NEW/EXISTING主标签及既有响应结构。

## 实现边界

按课次当地日期计算，不按今天；TRIAL主标签始终优先。已提交读categorySnapshot及membershipCategorySnapshot，无法核对的旧会员快照返回null，不用后来购课重写历史。lessonDto.newCount和教学记录复用相同逻辑；Teacher不返回余额/首次时间，Admin他人个人反馈仍隐藏。

## 不在本任务中

不写快照、不提交反馈、不改前端。

## 完成检查

未来/历史/购课前课次、Trial+New member、旧null快照；同一课次各接口标签一致，权限不扩大。同步OpenAPI。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
