# 04a · 新增预约改用双池校验

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[10a](10a-balance-service.md)、[07a](07a-followup-policy.md)、[00a](00a-shared-contracts.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第3节、00的重约来源规则。无需通读其他任务正文。

## 唯一目标

只改新增预约及其共享资格判断，不改恢复/换课调用行为以外的接口。

## 修改入口

packages/api/src/workflow/teaching.service.ts(add/qualification)、dto.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

POST /api/sessions/:id/participants保持studentId/kind；仅TRIAL可选sourceRebookingTaskId，REGULAR携带时400；成功仍ActionDto{id}。

## 实现边界

锁内校验本人学生、未来有效课、联系人、容量、所有科目冲突、对应池available>=1；REGULAR另须firstPurchasedAt。移除旧单科次数和人工日期资格。只写BOOKED/PENDING占用，不消费。不再调用closeOldFollowups按同科目批量关单；无来源ID就不关其他任务，有ID仅关闭该生同科目OPEN/REBOOKING并记录目标参与，失败全回滚。重复有效或取消历史行分别拒绝/引导restore，不能无状态upsert改kind。

## 不在本任务中

不改恢复/换课流程、课表UI或到课消费。

## 完成检查

跨科目抢最后1节最多一成功；购课会员仍可试听；正池不足拒绝；多试听待办不误关；来源任务越权/类型错拒绝。同步OpenAPI。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
