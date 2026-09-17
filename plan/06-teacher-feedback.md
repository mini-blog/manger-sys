# 06 · 老师课后待办与反馈提交

前置04、10；原版已实现，本轮课时消费与回访分流待开发；原验证记录见[docs/VERIFICATION.md](../docs/VERIFICATION.md)。实现位于src/workflow/teaching.service.ts、read.service.ts；前端MyTasks.tsx和TaskDetail.tsx内FeedbackForm。不搭通用工作流。

GET /tasks?status=OPEN&type=LESSON_FEEDBACK，所有角色底层永远assignee=currentUser，availableAt<=Clock.now；type只允许本人角色适用值。老师列表默认OPEN、按dueAt/id，GET /tasks/:id同样对象权限。无时钟HTTP后门，测试注入Clock。每条任务指向具体课次和有效名单。

POST /sessions/:id/feedback DTO见IMPLEMENTATION第4节，expectedVersion+幂等键。所有BOOKED成员恰好一次，出勤ATTENDED/NO_SHOW；每项feedback/abilityNote/preferenceNote<=1000，summary<=2000。到课试听feedback必填，正式反馈可选。只允许结束后实际Teacher提交，Admin不能代录。

单事务验证占用，保存每人出勤/反馈/categorySnapshot及membershipCategorySnapshot，ATTENDED为所选池追加唯一-1消费流水、NO_SHOW仅释放占用（正式课同样执行）、ClassSession反馈时间和payloadHash、Teacher任务DONE、每位TRIAL的Admin跟进Task。Task assignee取当前Student.ownerAdminId，reason按ATTENDED/NO_SHOW；到课按事务内是否会员设purpose=FIRST_PURCHASE/MEMBER_CARE，未到为REBOOKING，dueAt源课次结束次日当地17:00；空课次/全正式课不产生试听跟进任务。同source已有取消后恢复的任务则合法重开同一条，不重复插入。

反馈相同内容重试返回原结果；不同内容409，不能先拒“已经提交”导致网络重试永远失败。任务唯一来源和反馈hash在换幂等键重试时仍有效。正式生个人反馈也保存，解决原只支持试听的缺口。AI不在这个事务里调用。

UI默认老师首页“我的待办”，可切已完成；打开课后名单按试听/新会员/会员排序，逐个出勤并填反馈，课堂总结可选。保留输入直到成功；提交前显示人数，失败不关闭表单。课表已有结束但未反馈课显示Awaiting feedback，未到由人工确认。

验收：不到结束时间看不到可执行待办，直接API提前提交409；结束后无需重启/定时器即可查到；遗漏名单/他课ID/缺试听反馈拒绝。两次提交只一个老师完成事件、每到课人一条消费、每试听人一个Admin任务；故障全回滚，余额与占用不变。会员试听只扣试听，正常正式课只扣正式，未到两池都不扣。购课与反馈同时发生不得残留已会员的开放首次购课任务。不同Admin学生同课生成各自任务，各Admin互不可见。
