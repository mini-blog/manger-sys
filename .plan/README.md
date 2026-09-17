# 计划执行入口

[DESIGN](../DESIGN.md)决定业务方向，[AGENTS](../AGENTS.md)说明项目目的；[检查记录](AUDIT.md)记录本次与代码的对照及修正。2026-09-17已完成15个权益后端叶子任务及建档表单适配，详情见[阶段验收](../docs/ENTITLEMENT-MILESTONE.md)；02d待浏览器验收，整版未发布。

## 两条工作线

- **当前试听切片：12a–12e。** 建档→预约→老师反馈→Admin待办→AI建议→实际沟通。旧版单科试听资格/人工报名日期继续作为当前事实，不能宣传为购课权益。12c真实LLM未配置时单独记阻塞，不阻塞其他任务。
- **后续权益版本：00a、01a–10j。** 学生三Tab、可选赠1节、追加试听、正式自定义/套餐购课、双池消费、会员回访按计划逐项实现；当前赠课/发放/查询后端已完成，预约消费、页面及整体切换尚未完成。新规则整批替换旧逻辑；开发可以逐项进行，上线不能混用。

## 如何给AI一个最小任务

选择下表一个ID，例如“只执行02b，核对前置后实现并验证”。阅读00与该叶子文件，按任务指出的11节号补充上下文即可；不要一次加载整个.plan。每项都写出目标、准确源码入口、输入输出、原子边界、排除范围和完成检查。只有tasks/中的文件是执行任务；01–10、12为分组索引，00/11/AUDIT为参考，不能把参考文件当待开发大任务。

以一个领域命令、一个查询接口族或一个页面交互为单位；其DTO/依赖注册/OpenAPI/局部测试属于同一交付，不拆成脱离行为的装饰器小任务。反馈与扣减、购课与关单必须保留事务完整性。本阶段已验证后端局部行为，不等同于跨模块权益流程验收。

## 全部叶子任务与依赖

当前15项已完成、1项已实现待页面验收、32项待执行；完成时同时更新叶子执行记录和下表。ID不是运行顺序，严格按“直接前置”选择；所有依赖为代码/测试完成条件，不要求单独部署。

| ID | 单一交付 | 直接前置 | 类型 | 状态 |
| --- | --- | --- | --- | --- |
| [00a](tasks/00a-shared-contracts.md) | 共享权益枚举与类型 | 01a, 01b, 01c | 开发 | 已完成 |
| [01a](tasks/01a-ledger-schema.md) | 课时流水的数据库约束 | — | 开发 | 已完成 |
| [01b](tasks/01b-package-schema.md) | 预设套餐及历史快照字段 | 01a | 开发 | 已完成 |
| [01c](tasks/01c-workflow-schema.md) | 待办目的与会员标签字段 | 01a | 开发 | 已完成 |
| [01d](tasks/01d-migration-preflight.md) | 旧数据只读预检与核对文件 | 01a, 01c | 开发 | 待执行 |
| [01e](tasks/01e-migration-import.md) | 核对数据的幂等导入 | 01d, 02a, 07a | 开发 | 待执行 |
| [01f](tasks/01f-demo-seed.md) | 权益版幂等演示种子 | 01b, 01c, 02a, 10b, 10e | 开发 | 待执行 |
| [02a](tasks/02a-membership-date.md) | 墨尔本会员分类纯函数 | 00a | 开发 | 已完成 |
| [02b](tasks/02b-student-create-api.md) | 学生创建可选赠课API | 10b | 开发 | 已完成 |
| [02c](tasks/02c-student-read-api.md) | 学生分类查询API | 02a | 开发 | 待执行 |
| [02d](tasks/02d-student-form-ui.md) | 学生表单可选赠课 | 02b | 开发 | 已实现，待页面验收 |
| [02e](tasks/02e-student-tabs-ui.md) | 学生三Tab及日期刷新 | 02c | 开发 | 待执行 |
| [02f](tasks/02f-student-detail-ui.md) | 学生详情的会员与课时入口 | 02c, 10g, 10i | 开发 | 待执行 |
| [03a](tasks/03a-session-commands.md) | 课次改时与替课适配 | 04b | 开发 | 待执行 |
| [03b](tasks/03b-session-cancel.md) | 取消整节课的权益与任务联动 | 04b | 开发 | 待执行 |
| [04a](tasks/04a-booking-create.md) | 新增预约改用双池校验 | 10a, 07a, 00a | 开发 | 待执行 |
| [04b](tasks/04b-booking-cancel.md) | 取消单个预约 | 04a | 开发 | 待执行 |
| [04c](tasks/04c-booking-move.md) | 同科目原子换课 | 04e | 开发 | 待执行 |
| [04d](tasks/04d-roster-read.md) | 名单会员标签与教学摘要查询 | 02a, 01c | 开发 | 待执行 |
| [04e](tasks/04e-booking-restore.md) | 恢复同一课次的取消预约 | 04b | 开发 | 待执行 |
| [05a](tasks/05a-booking-ui.md) | 课次内选人的双池提示 | 04a, 04b, 04c, 10g, 10i, 04e | 开发 | 待执行 |
| [05b](tasks/05b-roster-feedback-ui.md) | 名单和教师反馈的会员标签 | 04d, 06a | 开发 | 待执行 |
| [06a](tasks/06a-feedback-command.md) | 课后反馈的消费与任务事务 | 10a, 07a, 04d | 开发 | 待执行 |
| [07a](tasks/07a-followup-policy.md) | 按来源管理跟进任务的事务原语 | 01c, 02a | 开发 | 已完成 |
| [07b](tasks/07b-followup-command.md) | 人工跟进与重开写接口 | 07a | 开发 | 待执行 |
| [07c](tasks/07c-task-read.md) | 任务查询的目的与关联字段 | 01c, 02a | 开发 | 待执行 |
| [07d](tasks/07d-followup-ui.md) | Admin跟进页的服务目的与购课入口 | 07b, 07c, 10i | 开发 | 待执行 |
| [08a](tasks/08a-ai-context.md) | AI按会员身份生成建议 | 07c, 07b | 开发 | 待执行 |
| [08b](tasks/08b-ai-stale-response.md) | 过时AI建议的前端丢弃 | 08a, 07d | 开发 | 待执行 |
| [09a](tasks/09a-concurrency-verification.md) | 权益并发与回滚集成验证 | 02b, 03a, 04c, 06a, 07b, 10f, 03b, 04e, 09d | 验收 | 待执行 |
| [09b](tasks/09b-workflow-ui-verification.md) | 权益版浏览器闭环验收 | 01f, 02d, 02e, 02f, 05a, 05b, 07d, 08b | 验收 | 待执行 |
| [09c](tasks/09c-cutover.md) | 权益版整体切换演练 | 01e, 01f, 09a, 09b, 09d | 集成 | 待执行 |
| [09d](tasks/09d-legacy-cleanup.md) | 旧资格接口与旧写契约退役 | 05a, 02d, 02e, 02f, 07d, 08b, 03a, 03b, 06a | 开发 | 待执行 |
| [10a](tasks/10a-balance-service.md) | 双课时池余额服务 | 01a, 00a | 开发 | 已完成 |
| [10b](tasks/10b-trial-grants.md) | 初始赠送与追加试听写入原语 | 10a | 开发 | 已完成 |
| [10c](tasks/10c-custom-purchase.md) | 自定义正式购课事务原语 | 10a, 07a | 开发 | 已完成 |
| [10d](tasks/10d-package-read-api.md) | 有效套餐只读查询API | 01b, 00a | 开发 | 已完成 |
| [10e](tasks/10e-package-purchase.md) | 套餐购课事务原语 | 10c, 01b | 开发 | 已完成 |
| [10f](tasks/10f-grant-command-api.md) | 新增课时HTTP命令 | 10b, 10c, 10e, 00a | 开发 | 已完成 |
| [10g](tasks/10g-entitlement-read-api.md) | 双池摘要与学生余额列表API | 10a, 02a, 01b | 开发 | 已完成 |
| [10h](tasks/10h-entitlements-ui.md) | 课时管理列表与只读流水页 | 10g, 10j | 开发 | 待执行 |
| [10i](tasks/10i-grant-dialog.md) | 新增课时弹窗与发放缓存 | 10h, 10f, 10d | 开发 | 待执行 |
| [10j](tasks/10j-ledger-read-api.md) | 课时流水只读分页API | 10g, 01b | 开发 | 已完成 |
| [12a](tasks/12a-current-api-verification.md) | 当前试听切片API回归 | — | 验收 | 待执行 |
| [12b](tasks/12b-current-ui-verification.md) | 当前角色首页与操作路径验收 | 12a | 验收 | 待执行 |
| [12c](tasks/12c-qwen-verification.md) | 真实千问成功与降级验证 | — | 验收 | 待执行 |
| [12d](tasks/12d-environment-verification.md) | 当前开发与生产环境验证 | 12a, 12b | 验收 | 待执行 |
| [12e](tasks/12e-submission-facts.md) | 最终文档与交付事实核对 | 12a, 12b, 12d | 验收 | 待执行 |

## 一条合法执行顺序

当前切片：12a→12b→12d→12e，12c可独立完成。权益版可按下列拓扑顺序，完成的前置可复用，不反复重做：

01a → 01b → 01c → 00a → 01d → 02a → 10a → 10d → 02c → 04d → 07a → 07c → 10b → 10g → 01e → 02b → 02e → 04a → 06a → 07b → 10c → 10j → 02d → 04b → 05b → 08a → 10e → 10h → 01f → 03a → 03b → 04e → 10f → 04c → 10i → 02f → 05a → 07d → 08b → 09b → 09d → 09a → 09c。

## 集成和验收纪律

小任务只改列出的职责，必要的类型消费者适配应明确记录；禁止以any或弱化校验让检查通过。接口改动即时同步OpenAPI生成类型，前端任务依赖实际端点；中间分支允许功能尚未接完，但只验证该任务相关包，不宣称全系统可发布。09c前完成所有相关消费者适配和全库构建。

后端领域方法接收同一tx，只有外层Commands创建事务、检查收据；禁止Service互相HTTP调用或嵌套各自提交。增量表/字段先兼容旧数据，旧数据核对及导入单独执行，最终再收紧约束。统一前后端发布；禁止依靠清库、删除用户卷、覆盖已应用迁移完成升级。

每个开发任务带局部正反用例；09a/09b只验证跨模块衔接，09d负责清退旧资格接口，09c负责上线顺序。失败或缺环境如实标注；不伪造真实千问/支付/公共仓库状态，不擅自发邮件或部署。正文页数与PDF留到最终整理。
