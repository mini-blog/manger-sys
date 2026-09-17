# 16 · 待办查询与实际沟通提交

P0，待做；前置07、14、15。src/followups/{controller,service,dto}.ts。

GET /follow-ups?status=OPEN&overdue=true&page=1：仅当前Admin负责学生，按dueAt,id；关联姓名、课程、老师、课次时间、出勤、反馈摘要和version。GET /follow-ups/:id 返回授权详情和分页notes；GET /students/:id/timeline 聚合咨询、试听、结果、沟通，返回类型+来源ID，稳定按createdAt/id分页，不将AI草稿当已沟通事件。

POST /follow-ups/:id/notes +幂等键，body {contactId,channel,outcome,content,occurredAt,nextDueAt?,action KEEP_OPEN|CLOSE,closeReason?,expectedVersion}。时间带offset；occurredAt不得晚于服务器当前时间（容忍60秒时钟差），明确它是实际沟通时间。contactId必须关联当前学生，渠道需对应信息；IN_PERSON不要求地址。只OPEN可更新。

NO_ANSWER/CONSIDERING/INTERESTED必须KEEP_OPEN且nextDueAt未来；INTERESTED不等于付款。NOT_INTERESTED要求CLOSE和原因；OTHER允许明确关闭但须原因，否则未来时间。追加Note、乐观version更新、幂等记录和审计同事务；不能只PATCH状态而不记过程。终态再发不同请求409 FOLLOWUP_CLOSED。

Admin可主动先选择家长电话/线下沟通，然后录入实际内容；系统不自动拨号发邮件。不提供Teacher销售数据。

验收：一场试听一待办，多次沟通多条历史；并发两个旧version只有一个成功；同键重试不多Note；未来occurredAt拒；关闭缺原因拒；跨学生contact403/400不泄露详情；仅看本人；AI草稿保存不影响本接口。
