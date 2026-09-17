# 01a · 课时流水的数据库约束

- 类型：开发；范围：后续权益版本；状态：已完成（2026-09-17，局部验证通过；未整体发布）。
- 前置任务：无；从已存在的代码开始。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第1节。无需通读其他任务正文。

## 唯一目标

只建立Student首次购课字段和不可变课时流水的存储基础。

## 修改入口

packages/api/prisma/schema.prisma；新增migration。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

新增Student.firstPurchasedAt? timestamptz；EntitlementEntry含studentId/bucket/kind/quantity/participantId?/actorId?/note?/sourceKey唯一/createdAt。套餐字段由01b添加。

## 实现边界

保留现有Student/Participant字段，不重复增加已有联系人、bookingStatus、attendance或feedback。SQL约束INITIAL_TRIAL=TRIAL/+1且每生最多一条；TRIAL_GRANT=TRIAL/+1..10000；PURCHASE=REGULAR/+1..10000；CONSUMPTION=-1且participant必填唯一；MIGRATION>=0、0仅REGULAR。其他kind不得带participant。外键限制删除已有关联历史的学生/参与记录；actor可空仅受控导入。

## 不在本任务中

不发放、不回填、不改预约规则，不加可编辑余额缓存。

## 完成检查

隔离PG应用旧迁移再应用新迁移；现有行不变；直接SQL插入非法池/数量/重复消费/重复初始赠送失败，合法行成功。pnpm db:generate及pnpm check。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

新增课时流水迁移和Student.firstPurchasedAt；SQL约束、唯一索引及历史外键在隔离PG验证。

验证：`pnpm check`、`pnpm test`、`pnpm test:entitlements`、`pnpm build`通过；HTTP契约执行`pnpm openapi:generate`同步。范围及具体证据见[阶段验收](../../docs/ENTITLEMENT-MILESTONE.md)。只操作隔离测试库；生产/用户库未迁移，整版切换仍依赖09c。
