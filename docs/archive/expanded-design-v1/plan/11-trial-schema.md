# 11 · 咨询、试听、反馈模型迁移

P0，待做；前置03、05。本任务仅数据库/类型/seed兼容，不做预约接口。

## 模型

- Inquiry：字段见07；studentId/courseId/createdBy外键，createdAt索引。
- TrialEntitlement：id,studentId,courseId,consumedByTrialId? unique；(studentId,courseId) unique。不存在消费记录意味着总权益1；创建时服务端按需发放，不开放余额PATCH。
- TrialBooking：id,inquiryId,studentId,sessionId,entitlementId,participantId unique,status SCHEDULED/ATTENDED/NO_SHOW/CANCELLED,createdBy,createdAt,resolvedAt?,cancelReason?,snapshot Json。快照含预约当时科目ID和名称、实际老师ID和姓名、startsAt/endsAt；跟进事件另保留授课快照。冗余student/course关联一致性由Service校验。
- TrialBooking 唯一(studentId,sessionId)；部分唯一索引(entitlementId) WHERE status='SCHEDULED'，防同时占用。consumedByTrialId消费引用和TrialBooking关联命名显式区分，不能出现Prisma模糊双关系。
- StudentFeedback：id,trialId unique,studentId,sessionId,teacherId,attendance ATTENDED/NO_SHOW,strengths?,difficulties?,preferences?,suggestedLevel?,comment?,createdAt；每项文本<=1000，ATTENDED至少comment非空。
- ClassSession 增加summary?（<=2000）、summaryVersion default1。全班总结单独保存不代替个体反馈。
- SessionParticipant 增加status ACTIVE/REMOVED defaultACTIVE、removedReason?；保留原唯一(sessionId,studentId)。新生标记按当前班级更早有效参与历史计算，不能客户端指定。

## 迁移与兼容

prisma/schema.prisma、新增migration、prisma/seed.ts。已有REGULAR标记ACTIVE；现有TRIAL seed补对应学生联系人/咨询/权益/TrialBooking，使用稳定ID实现幂等，不删除重建原名单。正常数据迁移不得伪造真实家长；旧数据库如存在非seed孤立TRIAL，需要迁移校验报告并标记待处理，不能凭空消费权益。

所有人数/教师学生范围/冲突查询都改为只计ACTIVE参与记录、未取消课次，别遗漏现有schedule.ts和students.ts。取消状态记录用于历史单独查询，不能混入当前名单。新增约束先回填再收紧。

## 验收

从当前种子库升级，无数据丢失；从空库迁移并seed两次记录数不增长；唯一约束拒重复生课、重复占权益；历史TRIAL全部有明确来源；现有课表仍60课，人数与有效名单一致；所有Prisma关系生成成功。
