# 14 · 课堂总结、试听生反馈与权益消费

P0，待做；前置11、12、15。src/results/*，扩components/Roster.tsx，新StudentFeedbackForm.tsx。

## 契约

PATCH /sessions/:id/summary {summary:1..2000,expectedVersion} 仅实际Teacher、有效且已结束课次。GET /sessions/pending-results 返回本人已结束仍有SCHEDULED试听的课次，含最早日期，独立于当前周过滤。

POST /trials/:id/result {attendance:ATTENDED|NO_SHOW,comment?,strengths?,difficulties?,preferences?,suggestedLevel?} +幂等键。仅课次当前实际老师，课次结束、未取消且预约SCHEDULED。ATTENDED要求comment trim后非空；先保存全班summary，再逐人结果；NO_SHOW可不写教学观察。每次请求只提交一名学生，便于部分成功及重试。

事务按00锁，写StudentFeedback、预约终态和resolvedAt。ATTENDED设置权益consumedByTrialId，剩余1→0；NO_SHOW不消费。sourceTrialId唯一FollowUp OPEN且dueAt下个当地日17:00。待办带课次/科目/老师/学生快照及反馈引用，负责人由学生当前owner决定。

相同已提交内容重试返回原值，即使使用新键也不能重复消费；不同结果/反馈409 RESULT_ALREADY_SUBMITTED。终态无PATCH，首版不做结果更正。Teacher不能提交自己未教的trialID；Admin不代填。

## UI

名单TRIAL置顶，文字标签+底色；其次本班新生；显示有效人数。先全班总结，再各试听生出勤/个人观察/反馈提交。已提交显示只读结果；保存成功刷新权益与待补录计数，不把整节课所有学生都变成到课。My lessons提供Awaiting results及历史日期入口。

## 验收

提前提交409；取消课403/409按策略明确；非本人课403；缺到课反馈400；同结果重试只有一次消费、一待办；不同结果409；NO_SHOW释放权益；事务故障三者全回滚。历史样例能立即演示，不等待新课结束。
