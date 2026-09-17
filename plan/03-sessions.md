# 03 · 具体课次、老师预建待办与修改记录

前置01、10。原版已实现，本轮占用联动待调整；原验证记录见[docs/VERIFICATION.md](../docs/VERIFICATION.md)。实现位于src/workflow/teaching.service.ts，复用GET /sessions及名单接口；不新建Timetable模型。

## API

GET /sessions?week=YYYY-MM-DD&q=&classGroupId=&courseId=&teacherId= 支持关键词班名/科目/老师，q<=80，所有筛选与Teacher当前用户scope做AND，不能覆盖teacherId限制。教师可省略或传本人teacherId，传他人403。Admin默认返回该周全部课次。

GET /sessions/options Admin只返回seed班级/科目/老师最小字段。POST /sessions {classGroupId,courseId,teacherId,startsAt,endsAt,capacity:1..100}；PATCH /sessions/:id {expectedVersion,teacherId?,startsAt?,endsAt?,capacity?,courseId?,classGroupId?,reason,confirmedAffectedParticipantIds[]}；POST /sessions/:id/cancel {expectedVersion,reason,confirmedAffectedParticipantIds[]}。均Admin，时间带offset且未来；teacher必须TEACHER，结束晚于开始。

修改事务重查教师/班级/全体BOOKED学生冲突、容量与名单课时占用一致性（不再检查旧入学日）；有参与历史（包括已取消名单）禁止换科目/班级。确认的参与者ID集合必须与事务内当前名单相同，若并发加人则409要求重新确认。课前替课无需取消所有试听，预约继续保留；保存ScheduleChange的前后安排与原因。改课不自动宣称家长已收到通知。

创建课次同步创建LESSON_FEEDBACK Task，availableAt=endsAt，dueAt=结束后的下一当地日17:00；改时间/老师同步更新任务。取消课次取消老师任务；所有BOOKED参与转CANCELLED，两个池的占用随之释放但不新增赠课流水；试听各建/重开reason=CANCELLED、purpose=REBOOKING的Admin跟进，保存此次取消的科目/班级/老师/时间快照，之后改课不改写取消事件。未来端点与04共用事务辅助，不能Controller互相HTTP调用。scope/Task来源唯一见IMPLEMENTATION。

GET /sessions/:id/changes分页，仅Admin，输出时间、操作人、动作、原因、受影响学生基础信息和前后值，不含家长联系方式/反馈原文。换课日志能沿source/target双方查看。

## 验收

同老师/班级并发重叠课最多一个成功；改课与同时加人不能漏冲突；容量不能低于人数；课次开始后改课409；取消无虚假ATTENDED。未来课老师任务不可见，到结束后出现，重启仍在；替课后旧老师不可读、新老师接手；改课与日志/Task任一步失败全回滚；取消整课同时释放试听和正式占用，重复取消不增加余额，改时/换老师不重新消费或发放权益。
