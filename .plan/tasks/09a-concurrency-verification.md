# 09a · 权益并发与回滚集成验证

- 类型：验收；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[02b](02b-student-create-api.md)、[03a](03a-session-commands.md)、[04c](04c-booking-move.md)、[06a](06a-feedback-command.md)、[07b](07b-followup-command.md)、[10f](10f-grant-command-api.md)、[03b](03b-session-cancel.md)、[04e](04e-booking-restore.md)、[09d](09d-legacy-cleanup.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的00事务及11第3–5节。无需通读其他任务正文。

## 唯一目标

只补跨命令不变量验证，单个接口正常用例由对应开发任务负责。

## 修改入口

新增packages/api/test/entitlements-concurrency.mjs；根package.json测试命令。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

真实隔离PG+HTTP，会话/CSRF/独立UUID数据；每个并发场景最终查询流水/占用/Task。

## 实现边界

验证最后一节跨课争用、首次购课并发、购课与反馈两种顺序、购课与旧version人工跟进、取消恢复/换课抢位，以及注入中途故障后原位/余额/任务/receipt不变。成功结果不依赖请求排序；会员不残留OPEN/FIRST_PURCHASE。接入有边界的测试命令，不能用mock事务证明原子性。

## 不在本任务中

不重测全部UI、不做迁移或部署。

## 完成检查

所有场景记录命令/退出码和不变量断言；仅清测试自建数据，原用户库不变。新发现的独立产品缺陷回到负责原子任务，不在此顺带重写模块。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
