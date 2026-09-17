# 12 · 试听预约与取消 API

P0，待做；前置07、11、15。src/trials/{controller,service,dto}.ts。

## 契约

GET /trials 分页，Admin只能本人学生；Teacher不走销售列表。可筛 status/studentId/from/to；GET /inquiries/:id/availability?week=YYYY-MM-DD 返回同课程有效课次、层级、老师、人数/容量、conflict/eligibility原因；偏好时间不强制，冲突必须阻止。

POST /trials {inquiryId,sessionId} + Idempotency-Key ->201。学生及课程取授权Inquiry，学生必须ACTIVE、有可联系主要家长；课次有效未开始，科目匹配，无已消费权益/其他SCHEDULED，无当前正式参与，检查学生所有未取消ACTIVE课次冲突和容量。按00锁并在事务内再次判断，不信前端余位。

事务创建/获取权益、创建ACTIVE的TRIAL参与及TrialBooking；(student,session)重复409 ALREADY_BOOKED；已取消同课也不重开。关闭该Inquiry开放待办及同Inquiry旧试听的OPEN待办，追加SYSTEM“已预约/重新预约”记录，其他咨询不变。

POST /trials/:id/cancel {reason:1..500} +幂等键 ->200。仅负责人，开课前且SCHEDULED；同原因重试返回原记录，冲突结果409。改CANCELLED，参与REMOVED，释放占用（不改consumed），按sourceTrialId创建一个跟进，dueAt下个当地日17:00。过期未录结果不能取消/新约同课程，返回 TRIAL_RESULT_REQUIRED。

## 稳定错误码

SESSION_FULL、STUDENT_CONFLICT、TRIAL_EXHAUSTED、TRIAL_ALREADY_RESERVED、COURSE_MISMATCH、SESSION_STARTED、ALREADY_BOOKED、TRIAL_RESULT_REQUIRED。不能把业务冲突全部映射成500。

## 验收

真实PG并发两人抢最后席位只能一个成功；同学生并发重叠课只能一个；取消释放座位且可约另一课；NO_SHOW后重约，ATTENDED后不能；正式生不重占；重复请求不多建待办；伪造inquiry/非本人学生403；事务故障回滚权益、名单、预约和待办。
