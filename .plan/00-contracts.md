# 共同约定（参考，不是执行任务）

每次只执行[tasks目录](README.md)中的一个叶子任务。DESIGN规定方向；本文件固定跨任务契约，11按节提供细则。索引与参考文件不是待开发模块，也不需要一次读完所有计划。

## 版本与代码现状

当前Part B是试听预约到实际沟通，使用已存在的单科试听资格和人工报名日期。12a–12e只验证当前实现。权益版已完成firstPurchasedAt、EntitlementEntry、LessonPackage、Task.purpose的兼容扩展及发放/查询后端；建档已采用可选赠课、拒绝旧日期写入。旧预约/反馈/人工ENROLLED仍待整体替换；不得把后端局部完成当作整版权益验收，进度见[阶段验收](../docs/ENTITLEMENT-MILESTONE.md)。工作区已有大量用户修改，先看代码再动手，保留数据/历史。

各任务可独立编写和局部测试，**不能独立发布半套新业务规则**。01a–01c先兼容扩展，01d/01e核对导入，09d退役旧接口，09c协调前后端与数据一次切换；不加双版本长期并行逻辑，不以清库处理迁移。约束收紧在核对之后，不能用普通compose首次启动顺序跳过核对。

## 权限、工程和接口

- Admin可读全局课表/学生基础资料，只有负责人能改学生、看联系人/沟通/余额/流水。名单加人/取消/恢复/换课仅本人学生；共享课次改时或整课取消可由Admin执行，须确认全体影响名单。
- Teacher只看当前本人有效授课关系的课次/学生和教学资料，不能看联系人、课时明细、套餐目录、首次购课精确时间。Task始终assignee本人，无Admin全局待办特权。
- 沿用Cookie/CSRF、DTO白名单、Clock和Commands。API前缀/api；400输入、401未登录、403越权、404不存在、409业务冲突。page>=1，pageSize=1..100，q<=80；稳定排序、计数与列表同一授权快照。
- 共享枚举/纯类型在packages/common，DTO/Prisma在api；前端仅用common与OpenAPI生成类型。新增provider/controller注册app.module.ts，生成文件不手改。各任务准确入口在正文，未标“新增”的是已有源码。
- 只有外层Commands.run负责事务/权限/收据，领域方法接收同一tx、不自行提交、不互相HTTP调用。沿用Serializable及统一写锁、最多3次冲突重试；模型调用在事务外。成功收据在授权后、业务状态校验前读取，同键异请求409。
- 语义改变的旧命令在09d统一采用新版operation名称，保留旧receipt；正常历史反馈重放仍受内容hash保护。不能删收据或凭换键重复扣课。

## 权益不变量（仅权益版）

- giftTrialCredit缺省true，false必须保留；true固定TRIAL/INITIAL_TRIAL +1，false不写零流水。PATCH不能发课，拒绝旧initialTrialHours及firstEnrolledOn新写。
- TRIAL_GRANT只增试听，不变身份/Task。REGULAR的CUSTOM与PACKAGE均PURCHASE，首次设置firstPurchasedAt，后续不重置；流水createdAt和首次时间使用同一个Clock.now。套餐数量与AUD分价取服务器有效版本，历史快照不漂移。
- remaining=流水数量和；reserved=对应池有效BOOKED/PENDING数；available=remaining-reserved。过期待反馈仍占用，到课扣1并结束占用，未到/取消只释放；两池不抵扣。双池摘要多查询要同快照，不能把暂时不一致截成0。
- 无首购为TRIAL_STUDENT；首次当地日d至d+6为NEW_MEMBER，d+7起MEMBER。学生页看今天，名单看课次日；历史早于d仍非会员。余额0不降级，续购不重置，历史快照不覆盖。
- PURCHASE只自动完成本学生OPEN/FIRST_PURCHASE；MEMBER_CARE与REBOOKING不受影响。来源reason与任务purpose分开，当前会员看旧销售Task时AI也不能首次推销。

## 多次试听后的重约关联

取消或未到产生的重约待办，与另一节独立试听没有自动因果关系。禁止继续使用现有closeOldFollowups(studentId,courseId)批量关闭同科目任务，也不能因同科目有任意PENDING就禁止重开历史任务。

新增TRIAL预约可带sourceRebookingTaskId，REGULAR携带时400。若不传，不关闭其他任务；传入时校验同学生/同科目/本人OPEN/REBOOKING，预约成功同事务写Task.rebookedToParticipantId并关该来源。恢复原参与只关该来源，换课只处理明确来源，不误关其他销售/回访。关联可通过ScheduleChange追踪，不新增通用任务历史表。

手动重开：仅本人DONE/CANCELLED、reason与未来nextDueAt及expectedVersion必填；原参与若已恢复成有效BOOKED/PENDING，或关联的重约目标仍BOOKED（含已到课/未到记录），则引导处理当前来源，不重开过时待办。关联目标已取消时可以重开；不能用同科目无关联课否决。会员始终不能重开FIRST_PURCHASE。来源结果重新生成Task时清理旧解决关联，历史沟通保持不变。

## 页面、验证与完成

当前首页仍我的待办。权益版新增Admin课时管理/entitlements，学生页三Tab；UI英文/en-AU，文档可中文。课表已有URL参数student供选人；课时页studentId和sourceRebookingTaskId按各任务定义透传，不随意全局改名。界面简洁，保留加载/空/错误及失败输入，不增加解释横幅、支付或套餐维护页面。

每个开发任务负责局部正反用例，金额/余额/授权/事务用真实PG验证；不只镜像实现写无意义测试。接口变更同步OpenAPI/common类型。09验证跨模块/整体发布；12验证原切片。只改文档时做链接/依赖/规则一致性检查，不跑无关应用测试、不宣称功能已完成。页数和PDF最后处理。
