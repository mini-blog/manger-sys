# 26 · 二期：正式入班与单次名单调整

P2，待做；前置09、10、14。首个子切片只支持明确有限的已生成课程日期范围，不承诺无限未来排课。

Enrollment: id,studentId,classGroupId,startsOn Date,endsOn Date（必须有，排他边界）,status ACTIVE/ENDED,createdBy,createdAt,version。SessionParticipant加enrollmentId?和source ENROLLMENT/TRIAL/MANUAL；SessionRosterException(sessionId,studentId,action INCLUDE/EXCLUDE,reason,createdBy)唯一生课，防重新物化时把移除学生加回来。

POST /enrollments {studentId,classGroupId,startsOn,endsOn}；POST /enrollments/:id/end {endsOn,expectedVersion,reason}；POST /sessions/:id/regular-participants {studentId,reason}；POST /sessions/:id/regular-participants/:studentId/remove {reason}。仅学生负责人Admin；Teacher不能调学生。只未来课次，范围覆盖现有有效课次，必须展示当前可排截止日，不以有限检查证明永久无冲突。

按00锁顺序，检查所有具体课次课程、容量、学生冲突；一项失败整体回滚；通过后物化REGULAR名单，试听不生成Enrollment。单次排除写exception+REMOVED，历史不删；续排新课时必须再次校验权益/容量/冲突，不静默塞入超额名单。同学生不同班允许不冲突。

班级详情成员页/学生详情入班页；“购买”“入班”独立，未收款允许入班需业务明确，本任务默认需要对应课程余额>0，余额不能保证整期可上，提示预计不足但不预扣。将此新增约定同步DESIGN。

验收：两班无冲突可入、有冲突整批回滚；同课重复成员不重复；例外重物化仍移除；试听未成交不会自动成正式；教师跨权限拒绝。
