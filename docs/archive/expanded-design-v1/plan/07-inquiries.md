# 07 · 咨询建档和意愿时间

P0，待做；前置05、11、15（先有Inquiry表、FollowUp表，避免循环依赖）。

## API / 数据

Inquiry字段由11迁移：id,studentId,courseId,summary(1–2000),initialLevel?,preferredTimeWindows Json,createdBy,createdAt。每个window为 {weekday:1..7,start:'HH:mm',end:'HH:mm'}，1–10个，同天start<end，固定Australia/Melbourne；不支持跨午夜窗口。能力等级本次为 Foundation/Developing/Confident/Not assessed，记录为初步观察。

POST /students/:id/inquiries {courseId,summary,initialLevel,preferredTimeWindows} +幂等键。负责人、学生ACTIVE、课程有效，至少一位primary且可联系联系人。事务创建Inquiry及sourceInquiryId唯一OPEN待办，dueAt下一个墨尔本日17:00；并追加审计。GET /students/:id/inquiries按时间倒序分页，只有负责人。

## 前端 / 文件

src/inquiries/*，学生详情中InquiryForm.tsx。按钮Record enquiry；课程下拉来自已有seed目录的授权只读lookup（本任务提供 GET /inquiries/course-options，仅Admin），录沟通摘要和多个时间段。保存后显示咨询卡、下一步Book trial，预约弹窗带inquiryId。

本次不做覆盖旧咨询；改变需求可新建新咨询，旧咨询在跟进里说明关闭原因。同一学生同课程可有多咨询，但权益按学生课程统一，不因此多送试听。

## 验收

缺联系人/偏好时间非法/非负责人被拒；重复请求只有一条Inquiry一个待办；失败事务无孤儿；科目与学生信息由数据库验证。班级级别不自动决定学生能力；偏好只是筛选提示，可经沟通选择其他时段。
