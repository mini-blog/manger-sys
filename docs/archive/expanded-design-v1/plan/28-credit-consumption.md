# 28 · 二期：正式出勤、扣课与续费提醒

P2，待做；前置26、27。和试听权益完全分离。

Attendance: id,studentId,sessionId,result ATTENDED/NO_SHOW,chargeStatus CHARGED/PENDING/NOT_REQUIRED,createdBy,createdAt；唯一生课。首版仅ATTENDED扣1单位，NO_SHOW不扣，其他迟到/请假扣费规则待明确，不擅自补齐。课时单位并非钟表小时。

POST /sessions/:id/attendance {studentId,result} +幂等键：实际Teacher、结束后有效REGULAR成员；事务锁学生/课次/课程账户，写Attendance；余额>=1创建唯一attendance:attendanceId的-1流水，否则保存到课但PENDING不出负余额。相同重试返回原结果，不同结果409。

POST /attendance/:id/charge 负责人Admin重试待扣，付款后也必须唯一扣次；POST /credit-entries/:id/reverse {reason} 负责人Admin，只冲正ATTENDANCE扣除项，唯一反向引用，更新对应Attendance为NOT_REQUIRED并留审计，避免后台再次自动扣回。不是现金退款，也不修改原始账。

GET /students/:id/credits 返回各课程余额和分页流水，只负责人。Admin工作台低余额<=2及待扣提示；Teacher只见本课出勤结果，不显示家长付款或余额。续费提醒首先是查询列表，不自动发消息、不从低余额推断家长流失。

验收：两节课争同一余额只一笔扣成功、另待扣；补款重试不重复扣；试听不扣正式账户；冲正两次最多一次成功，余额与流水一致；Teacher无法调用收款/冲正。
