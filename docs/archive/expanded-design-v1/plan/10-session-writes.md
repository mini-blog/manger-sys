# 10 · 单次课次创建与调整

P0，待做；前置02、11、12。目录管理08/09不是硬前置，可用seed课程和班级；人员lookup只返回可授课教师基本字段。

## 模型 / API

ClassSession增加version；新增不可变SessionChange(id,sessionId,actorId,before Json,after Json,reason,createdAt)，JSON只含排课字段。POST /sessions {classGroupId,courseId,teacherId,startsAt,endsAt,capacity:1..100}；PATCH /sessions/:id {上述可选字段,expectedVersion,reason:1..500}；POST /sessions/:id/cancel {expectedVersion,reason}。全部Admin，时间必须未来，结束晚于开始，Teacher用户/班级/课程有效。提供GET /sessions/options返回最小班级/课程/老师供排课，Admin限定。

采用00锁顺序和Serializable；验证教师、同一班级、全部ACTIVE学生的时间冲突，以及容量不低于有效人数。更换classGroupId有名单时拒绝，首版只允许空名单换班。课次有SCHEDULED试听时修改科目/时间/老师拒绝409 TRIAL_RECONFIRM_REQUIRED；本版流程为先逐条取消预约、联系家长、改课、重新预约，取消历史保存快照。正式生调课留SessionChange供负责人查询，不假装已发送通知。

取消未来课次在一个事务取消所有有效试听、标记参与REMOVED、释放权益并建各自待办；任一失败全部回滚。正式参与记录同时REMOVED，保留原因。取消后不能结果提交。当前日期已开始/历史课次禁止编辑，不允许通用PATCH改status。

## 前端 / 文件

扩src/schedule拆service与controller；components/SessionEditor.tsx，Timetable新增New lesson和Admin课次详情Edit/Cancel；教师没有按钮。时间字段明确Melbourne；重复/缺失DST本地时间直接拒绝，不静默偏移。首版只编辑单次，绝不显示“所有后续”。

## 验收

并发同老师两个重叠新课最多成功一个；改时间撞学生/班级拒绝；容量8降3但已有4人拒绝；有试听不能静默换科目；取消整课释放席位和权益且每生一待办；历史课次409；教师403；审计回滚一致。
