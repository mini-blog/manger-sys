# 07 · Admin个人待办与实际跟进

前置02、06、10；原版已实现，本轮会员与购课关单联动待开发；原验证记录见[docs/VERIFICATION.md](../docs/VERIFICATION.md)。实现位于src/workflow/tasks.service.ts、MyTasks.tsx和TaskDetail.tsx；首页已替换为个人待办。

GET /tasks?type=TRIAL_FOLLOWUP&status=OPEN&overdue=，仅assignee本人；详情包含学生、联系人（仅学生负责人）、源课次/科目/老师、出勤和教师反馈、取消/未到/完成原因及沟通历史。Admin禁止访问其他人的Task ID，包括Teacher任务；全局课表只显示反馈是否已提交，不开放其私人待办。

POST /tasks/:id/follow-up {expectedVersion,communication:{实际联系人姓名快照,channel,content,occurredAt},outcome,nextDueAt?,closeReason?}，幂等键必填，只本人OPEN任务。NO_ANSWER/CONSIDERING/INTERESTED保持OPEN且下次时间未来，NOT_INTERESTED关闭，RESOLVED仅MEMBER_CARE/REBOOKING服务处理可用且须原因。拒绝客户端ENROLLED/firstEnrolledOn，历史该结果仍可读。手动关闭和记录有意向不能把学生变成会员。

详情包含purpose与会员类型，FIRST_PURCHASE提供“登记购课”进入10并预选studentId；没有直接“确认报名即成为会员”按钮。购课事务自动将该学生所有开放FIRST_PURCHASE关为DONE/PURCHASE_RECORDED，关联发放流水；不伪造沟通记录，不影响REBOOKING/MEMBER_CARE。关闭原因显示“已登记购课”，不显示“支付核验成功”。会员仍上试听时由06建MEMBER_CARE，仅回访学习感受与安排。

沟通追加与Task版本/状态同事务，不修改会员日期，已DONE任务重复原请求返回原响应，不同请求409。用户日后联系可用02独立日志，不要求重新打开任务；确需继续此来源跟进才POST /tasks/:id/reopen {expectedVersion,reason,nextDueAt}，仅本人DONE/CANCELLED且无该科目新的待处理试听；已会员不能重开FIRST_PURCHASE，返回409 MEMBER_ALREADY_PURCHASED；来源冲突则引导去当前预约。取消恢复/换课的Task重开逻辑复用04，不任意改状态。

取消或未到任务以重约为主，也可记录“不再考虑”关闭；重新预约成功关闭旧开放任务，不能让同一学生同一预约的旧取消任务一直逾期。Task状态变化的人工依据写CommunicationLog；购课自动关闭引用EntitlementEntry；排课触发变化随ScheduleChange记录，不再增独立TaskHistory表。

UI列表只列本人、到期排序，学生/科目/时间/老师/原因/到期与操作；详情里直接看反馈、记录实际沟通、选择结果及下一步。未联系不预选成功；已有AI入口复用，按08更新会员与非会员建议。按钮Save communication，失败留输入；409不能自动覆盖新版本。

验收：老师提交后正确Admin见任务，另一个Admin直接API403；到课/未到/取消文案不同；连续两次沟通两日志而一Task；已关闭仍可独立记日志；INTERESTED不变会员；首次购课自动关闭正确任务，续购不重置会员日，会员回访可关闭且重约不被购课误关；购课与人工跟进并发旧version返回409；任务过期由时间自然计算；日志/Task失败同回滚。
