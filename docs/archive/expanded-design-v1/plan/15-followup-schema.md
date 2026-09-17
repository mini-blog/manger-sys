# 15 · 待办与沟通记录数据模型

P0，待做；前置11。只建模型和事务内可复用的创建方法，不提前实现结果/跟进接口。

FollowUp: id,studentId,sourceInquiryId? unique,sourceTrialId? unique,dueAt timestamptz,status OPEN/CLOSED,version default1,closedReason?,sourceSnapshot Json,createdAt/updatedAt。SQL CHECK恰好一个source非空；索引(status,dueAt)、studentId。归属通过Student.ownerAdminId查询，不复制容易过期的owner；操作者保留历史。

FollowUpNote: id,followUpId,kind HUMAN/SYSTEM,contactId?,channel? EMAIL/PHONE/SMS/WECHAT/IN_PERSON,outcome? NO_ANSWER/CONSIDERING/INTERESTED/NOT_INTERESTED/OTHER,content(1–2000),occurredAt,createdBy,createdAt,nextDueAt?。HUMAN要求联系对象及实际渠道，SYSTEM不伪造联系人；只追加不更新。FollowUp sourceSnapshot只保留业务最小信息，不复制电话号码。

src/followups/followup-writer.ts 提供 createForInquiry(tx,...)、createForTrial(tx,...)、closeForRebooking(tx,...)；均接受已有事务客户端，不能自己开启独立事务。使用来源唯一约束，返回已存在记录，不能upsert反复把已关闭待办重置OPEN。

迁移schema、SQLcheck、生成Prisma。验证无来源/双来源被DB拒，重复source拒；多学生同课产生不同待办；构造异常时外层业务和待办同时回滚。为07、12、14提供固定方法签名并在文件注释写清。
