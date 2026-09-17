# 01 · 会员与课时流水迁移

前置00。原模型已实现；以下是待开发增量。修改apps/api/prisma/schema.prisma、新增migration、seed.ts，不修改已应用迁移，不清库。字段细节以IMPLEMENTATION第1节为准。

## 模型

1. Student新增firstPurchasedAt? timestamptz，只读首笔购课投影；原firstEnrolledOn/isNewToClass保留兼容但退出新业务判断。没有可手动写入的会员类型或余额字段。
2. 新建EntitlementEntry：studentId、bucket、kind、带符号quantity、participantId?、actorId?、note?、sourceKey唯一、createdAt。INITIAL_TRIAL每生唯一，PURCHASE只正数REGULAR，CONSUMPTION只-1且每participant唯一，MIGRATION非负，0仅受控导入已核对的零余额会员凭证。SQL约束+Service核对学生/池/来源；初始/购买发放1–10000，期初迁移按核对总量，不受单次购买上限限制。
3. Task新增purpose（Admin必填、Teacher为空）和resolvedByEntitlementEntryId?；保留原两个来源唯一索引、状态与version。SessionParticipant增加membershipCategorySnapshot?，原categorySnapshot继续作为历史主标签。
4. 不新建Contact、TrialBooking、套餐、订单或支付表；占用由参与关系推导，不另建可漂移余额缓存。已有CommunicationLog、ScheduleChange、MutationReceipt继续复用。

## 旧数据迁移（必须先预检再启用新规则）

- 输出逐学生的历史到课试听C、BOOKED/PENDING试听R，以及正式参与记录、原入学日；历史已过时间不能自动记到课。预检只输出必要标识，不输出联系人敏感信息。
- 试听期初导入：grant=max(1,C+R)，为历史已提交ATTENDED试听各建唯一-1消费、保留R占用。因此有消费/占用者不额外赠送，均无则可用1；说明这是从旧单科资格迁到学生通用池的期初归并。原规则下未预约科目的潜在次数不累计成新赠课。历史已提交NO_SHOW/取消不消费。
- 正式参与不能凭firstEnrolledOn或ENROLLED沟通生成购买事实。上线前由负责人核对首次购课时间、截至迁移时点的未消费余额（含占用）及历史到课数；导入已确认期初总量=未消费余额+历史到课数，再补历史唯一消费；期初总量为0但已确认购课的会员保留一条0数量MIGRATION审计凭证（正常发放API仍拒绝0）。现有待上课占用不得大于未消费余额。核对来源/操作者/批次记录在MIGRATION note/sourceKey中；仅该受控导入可设置经确认的历史firstPurchasedAt。
- 未确认的学生不猜购课：没有正式参与可保持未购课；存在正式参与或其他无法核对的会员凭证则列异常清单，阻止切换新规则，先人工核对处理，不静默取消课程或凭空补课时。历史ENROLLED沟通只保留事实原文。
- 旧Admin任务：取消/未到映射REBOOKING；试听到课开放任务按核对后会员身份映射MEMBER_CARE或FIRST_PURCHASE。已完成任务保留原因/日志，不伪造购课自动关闭流水。已提交名单原标签不覆盖，新辅助快照无法可靠还原则留空。
- 增量迁移采用扩展字段/表→预检与受控幂等导入→不变量检查→切换服务和页面；维护窗口暂停业务写入，失败不部分切换。既有receipt与历史记录保留。

## Seed和验收

虚构seed用稳定sourceKey建立初始试听/购课/消费，可明确写入示例首次购课日期；重复seed不覆盖编辑、余额或首次日期，不“补满1节”，跨周不再派送初始权益。覆盖未预约直接购课、会员仍有试听、试听0/1/多节、正式余额0及首次购课第0/6/7天。

空库迁移+seed、旧库副本升级、重复导入均成功且流水不重复；未核对正式余额必须拦截；校验两池remaining>=reserved>=0、消费唯一、会员时间可信、历史标签不变。保存迁移前后对账和恢复步骤，不在真实开发库做破坏性验证。
