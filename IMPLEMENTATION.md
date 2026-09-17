# 精简切片 · 实现约定

以 [DESIGN.md](./DESIGN.md) 为业务基准，[plan/README.md](./plan/README.md) 为执行入口。旧大范围方案在 docs/archive/expanded-design-v1，仅供历史参考。既有试听切片已实现；本文件中的三类学生Tab、双课时池与权益管理为本轮待开发规格。旧验收仅证明原版，不能视为新规则已实现。

## 1. 模型取舍

不新建Contact、StudentContact、Inquiry、TrialBooking、StudentFeedback或通用业务引擎；联系人在Student上，预约/出勤/个体反馈在SessionParticipant上，机构与班级课表都是ClassSession查询。Course是科目目录、ClassGroup是固定班级分组，保留现有两表和seed，但本版不增加目录CRUD页面。

Student增加guardianName、guardianRelationship、guardianPhone?、guardianEmail?、guardianWechat?、preferredChannel?、preferredLanguage（en-AU/zh-CN）、learningGoals?、preferredTimes?、interestedSubjects?、firstPurchasedAt?（timestamptz，只由首次正式购课流水或经核对的迁移设置）、version。基础建档可只填姓名/年级，预约前必须有联系人姓名和至少一种联系方式；EMAIL/PHONE/SMS/WECHAT偏好须有对应字段。学生与家长姓名分别保存；联系方式不唯一，电话支持AU与海外格式。先使用原有稳定Course id，意愿只做备注，不作硬性限制。

SessionParticipant继续唯一(sessionId,studentId)，增加bookingStatus BOOKED/CANCELLED、attendance PENDING/ATTENDED/NO_SHOW、feedback?、abilityNote?、preferenceNote?、version。kind TRIAL/REGULAR沿用；取消不删除；恢复同课次预约显式执行，保留ScheduleChange。同科目换课旧行CANCELLED，目标行新建或恢复，来源/目标都留记录。反馈提交后历史参与记录不可直接修改。课时统一由EntitlementEntry流水计算，预约占用仍来自SessionParticipant，不另建预约单、钱包余额缓存或占用表。科目有参与历史（包括取消记录）后不可更改，保持历史课程语义稳定。

EntitlementEntry：id、studentId、bucket TRIAL/REGULAR、kind INITIAL_TRIAL/PURCHASE/CONSUMPTION/MIGRATION、quantity（带符号整数，除MIGRATION外非零）、participantId?、actorId?、note?、sourceKey（全局唯一）、createdAt。INITIAL_TRIAL仅TRIAL且正数，每学生唯一；PURCHASE仅REGULAR且正数；CONSUMPTION为-1且必须participantId，每参与者最多一条；MIGRATION非负数，用于核对过的期初导入；0只允许受控导入记录已核对的零余额会员凭证。SQL CHECK约束符号与类型，Service校验来源学生/池对应；外键禁止误删历史。正常单次发放量1–10000，初始量默认1；受控期初迁移数量按对账值处理。流水只追加，不开放PATCH/DELETE、负数购买、任意余额修改、赠送正式课时或退款冲正入口；误登记应经人工核对后安排带审计的修正，不直接改库覆盖历史。

每个学生两个跨科目通用池，每课次1单位，TRIAL与REGULAR不能互相抵扣。remaining=sum(quantity)，reserved=count(BOOKED/PENDING且对应bucket的参与)，available=remaining-reserved；取消课次内不得残留BOOKED占用。已过期未反馈也占用；ATTENDED在同一事务写-1并结束占用，NO_SHOW只释放。不得出现remaining<reserved或available<0。不允许直接改kind来绕过消费；会员身份并不禁止TRIAL。

Student.firstPurchasedAt为首笔PURCHASE.createdAt（或经核对的MIGRATION凭证中历史首次购课时间）的只读投影，首次发放同事务设置，后续永不重置；新建学生DTO不接受它，Student PATCH也不能设置。正常登记由服务器Clock给时间，不接受客户端回填日期。旧firstEnrolledOn/isNewToClass只保留迁移兼容，不再作为会员凭证或新会员依据。真实旧数据迁移须核对，见plan/01。

Task字段：id,type,assigneeId,sessionId,participantId?,status OPEN/DONE/CANCELLED,reason?,sourceSnapshot?,availableAt,dueAt,version,completedAt?,createdAt/updatedAt。Teacher任务participantId必须空且唯一sessionId（按type部分唯一索引）；Admin任务participantId必填且唯一participantId（按type部分唯一索引）。SQL CHECK type与来源字段匹配。Admin任务的sessionId和participantId引用同一课次由Service校验。Admin任务在取消或反馈时保存科目、班级、老师和时间快照；以后课次改时间或替课，已发生事件的上下文不漂移。类型只两种，不开放通用任务类型配置。Admin任务增加purpose=FIRST_PURCHASE/MEMBER_CARE/REBOOKING（Teacher为空），与reason分别表达跟进目的和来源事件；购课自动关闭时记录resolvedByEntitlementEntryId。

ScheduleChange记录sessionId、可选targetSessionId/studentId/participantId、actorId、action、reason、before/after Json、requestKey、createdAt；只保存排课/名单必要字段，不保存家长联系方式和密码。CommunicationLog记录学生、可选任务/参与记录、联系人姓名及关系快照、渠道、结果、内容、实际沟通时间和作者；链接对象均必须属于当前学生，不能借id跨对象操作。

## 2. 可见范围

所有写接口沿用Cookie会话和CSRF。Admin读全局课表和学生基本数据；学生联系方式、沟通、权益余额/流水及个体销售跟进仅负责人读写。会员类型为基础分类字段，可在授权基础列表中返回；Teacher不得取得首次购课精确时间、购买数量、余额或流水。权益管理仅Admin本人学生可查可发，不继承全局课表的修改范围。名单添加/移除/换课只能操作本人学生，课次整体改时间/换老师可操作共享课次，但重查全部学生冲突并留记录。Teacher只看当前分配给自己的课次及名单，不返回家长联系人或销售日志；我的学生由这些课次参与关系获得。Task永远按assigneeId过滤，Admin也不能查询其他人的个人待办。

本切片不新增账号管理/密码重置/员工禁用/学生转交接口，避免引入与业务权限不一致的系统管理能力。负责人保持创建时分配；未来转交须同时更新未完成Admin任务的assigneeId，历史作者不改。课前替课原子修改教师任务的assignee，旧老师随即失去该课及任务权限。课后实际教师更正和结果纠错需后续受控审计流程，本版不开放通用PATCH绕过。

## 3. 排课和预约事务

POST/PATCH修改都用DTO校验，拒绝未知字段；列表有分页、稳定排序和用户scope。写操作使用Serializable事务，P2034/P2002最多尝试3次。当前以事务级pg_advisory_xact_lock(73192461)统一串行化短业务写操作；锁后重读权限、影响集合及约束。Serializable冲突重试处理等待锁时已获取的旧快照。所有业务命令都经过Commands，读取和LLM不占锁。此规模下先用统一写锁降低实现复杂度，更大并发再按Teacher→Student→ClassSession排序细分。所有外部LLM调用在事务外。

只预约/修改未来SCHEDULED课次。冲突半开区间a.start < b.end && b.start < a.end；检查教师、班级和全部BOOKED学生，取消课次不参与。容量只计BOOKED。Teacher资格验证role=TEACHER。只要有参与历史（包括已取消）就禁止更换Course和ClassGroup；可以调整老师/时间/容量，但不得冲突或超容量，须明确确认受影响学生及写原因。

TRIAL预约检查学生归属、联系人、试听available>=1、重复名单、所有科目时间冲突。REGULAR检查已购课及正式available>=1。不限每生每科目一次，初始试听发放多节可预约多次，但每次各占1；不同科目也共享同一池。Teacher不直接发放权益。联系资料不足与余额不足使用不同错误码，不能用填入入学日解决余额不足。

取消后同课重新预约使用原行+version并重置为BOOKED/PENDING；必须未开始、无历史已提交出勤、权益可用、无冲突且有席位。同科目换课必须一个事务：验证目标（计算可用时排除自身旧占用）、旧行取消、目标新建/恢复、写双向变更，再处理关联跟进任务；目标满员等失败旧预约保持。不允许把TRIAL静默改REGULAR，同课次试听身份保留；购课后的后续课另加REGULAR。

同一来源Admin跟进Task只保留一条：取消创建/重开reason=CANCELLED；恢复或换课成功关闭旧OPEN跟进，reason=REBOOKED；之后新的结果提交按有效participant来源创建/重开同一条，reason=TRIAL_COMPLETED/NO_SHOW，并用当前学生owner设assignee。取消/未到purpose=REBOOKING；试听到课按事务内当前会员身份设FIRST_PURCHASE或MEMBER_CARE。已完成的沟通日志不改；排课触发的任务变化随ScheduleChange记录，人工跟进变化随CommunicationLog记录；重复请求不追加多份。

所有可重试命令携带Idempotency-Key(UUID)。技术表MutationReceipt唯一(userId,operation,key)，保存规范化请求hash及最小响应；必须包含路径对象ID避免相同正文不同对象混淆。权限验证后，同键同请求返回旧结果、同键不同请求409。receipt与业务同事务，事务失败不保留成功记录；技术表不生成页面。反馈另有源状态唯一保护，换一个幂等键也不能重复消费或建任务。

## 4. 老师反馈和待办

每个有效ClassSession创建时预建一条LESSON_FEEDBACK任务：assignee=teacherId，availableAt=endsAt，dueAt=nextMelbourneDay17(endsAt)。查询只返回availableAt<=Clock.now且符合状态的本人任务；无需cron。历史seed用幂等方式补任务，取消课次关闭任务。未来调整课次同步修改任务availableAt/dueAt及assignee，不能改课后留下旧任务。

未提交课次状态：开始前Upcoming；开课中In progress；结束后Awaiting feedback；feedbackSubmittedAt非空为Feedback submitted。只是展示派生值，不把时间到当作学生ATTENDED。

POST /sessions/:id/feedback只接受当前教师，在endsAt之后提交：expectedVersion、summary?、students[{participantId,attendance,feedback?,abilityNote?,preferenceNote?}]。必须恰好覆盖本课全部BOOKED成员，无重复、无他课ID；全班总结可选，到课试听必须个人feedback，NO_SHOW不强迫写虚构观察。REGULAR也支持可选个人反馈。空课允许明确提交空名单完成老师任务，不产生Admin任务。

单事务检查每人的有效占用，写每人结果及到课者对应池唯一CONSUMPTION流水（正式课同样扣1、未到不扣）、课次feedbackSubmittedAt、老师任务DONE、每名TRIAL的Admin任务。到课生成TRIAL_COMPLETED，purpose由当前会员身份确定；未到生成NO_SHOW且purpose=REBOOKING，dueAt按原课次结束的下一当地日17:00；晚补录不掩盖延误。同结果（全部字段标准化）重试返回原值，修改已提交结果409。没有反馈提交就不创建“试听已完成”的销售跟进；Admin可从课表查看本人学生所在课次仍待老师反馈，但不能读取老师私人任务。

## 5. 跟进、沟通与AI

Admin我的待办按到期排序，含取消/未到/到课三种明确原因。独立POST /students/:id/communications可在预约前、待上课、跟进关闭后追加记录；不要求Task OPEN，不能用沟通记录绕过Task状态变更权限。记录实际联系人姓名/关系快照、渠道EMAIL/PHONE/SMS/WECHAT/IN_PERSON、occurredAt和正文；渠道校验使用所记录的实际联系信息，首版默认当前联系人，不提供多联系人管理。

POST /tasks/:id/follow-up只允许本人TRIAL_FOLLOWUP OPEN：expectedVersion、communication正文、outcome NO_ANSWER/CONSIDERING/INTERESTED/NOT_INTERESTED/RESOLVED、nextDueAt?、closeReason?。前三者保持OPEN且nextDueAt未来；NOT_INTERESTED关闭，RESOLVED只用于会员回访或无需重约的服务处理，均须原因。取消客户端ENROLLED/firstEnrolledOn写入，不能用一句“已报名”或关闭待办变会员。历史ENROLLED日志保留展示，不据此伪造购课记录。购课入口带studentId进入权益管理，确认发放才完成首次购课。

POST /entitlements/grants {studentId,quantity:1..10000,note?:<=1000}，Idempotency-Key必填，只负责人Admin；类型固定PURCHASE、池固定REGULAR，客户端不能改类型、操作者或首次购课时间。事务内写流水、若空设置firstPurchasedAt并递增Student.version、关闭该学生所有OPEN/FIRST_PURCHASE任务（reason=PURCHASE_RECORDED、resolvedByEntitlementEntryId指向本笔，递增Task.version），写receipt。一个环节失败全部回滚，重复请求不重复加课；后续续购不重设日期。即使没有任何试听预约也可购课。发放不伪造CommunicationLog；发放流水本身是自动关单的审计依据。

购课不关闭REBOOKING或MEMBER_CARE，避免丢失未到重约/教学回访；若购课在老师反馈之前，该试听结束后直接建会员回访而不是首次购课任务。反馈与购课共用写锁，无论先后顺序最终都不残留已购课学生的开放FIRST_PURCHASE。人工跟进与购课并发用Task.version阻止旧页面覆盖自动关单。

沟通日志与人工任务更新同事务；关闭后仍可独立记录。reopen需原因、未来时间和version，且无更新的有效试听来源冲突；已会员禁止重开FIRST_PURCHASE（409 MEMBER_ALREADY_PURCHASED），会员关怀可以独立记沟通或处理该学生新产生的MEMBER_CARE任务。

千问入口绑定taskId，限定该学生、该科目、本次课堂反馈与相关人工沟通，不混用其他科目购买意向。加入服务端推导的会员类型、任务purpose；仅声明人工购课记录，不声明支付已核验。会员任务生成学习适应/试听感受回访，不能生成“首次报名”销售话术；不传具体购买数量/财务流水。响应schema：summary、observations[{text,sourceIds}]、questions[]、suggestedNextStep、talkingPoints[]、subject?、messageDraft?；en-AU/zh-CN，EMAIL需subject/body，PHONE/IN_PERSON用提纲。来源ID逐项验证，文本长度上限，额外字段拒绝。无依据不推断；不输出成交百分比、优惠或虚构付款结论。返回source=llm/template，由服务端附加生成时间和来源记录ID。

用户点“生成建议”才调用；无key、超时、上游错误、JSON或引用无效时返回同渠道模板，任务始终可人工处理。10秒超时，按用户限频。仅发送必要文本，屏蔽档案内已知姓名/联系方式及可识别邮箱/电话模式；自由文本脱敏不是完备的隐私保证，录入者仍应避免额外个人敏感信息；输入资料不能修改模型规则，无工具写操作。草稿暂留页面内存，不算沟通、不改Task，复制不算发送。API key只在后端，真实provider成功与降级需分别验证。

## 6. 时间和标签

DateTime使用timestamptz；传带offset的ISO时间，展示固定Melbourne/en-AU。输入不存在或双解的当地时间报错，星期模板暂不实现。

membershipCategory派生枚举：TRIAL_STUDENT（firstPurchasedAt为空）、NEW_MEMBER、MEMBER。令d为首次购课的墨尔本当地日期；参考日期落[d,d+7日)为NEW_MEMBER，达到d+7日为MEMBER。学生页参考今天；课次名单参考课次日期（若早于d则当时非会员）。7日是日历日，不是168小时。续购、建档日期、余额清零都不改变d。服务端Clock唯一计算，返回membershipAsOfDate及下一个当地零点的nextCategoryChangeAt；前端到点、恢复前台及购课成功时刷新，不能刷新浏览器才跨Tab。列表分页、Tab计数、筛选使用同一参考日期，不先分页后分类。

名单主标签kind=TRIAL始终为Trial并置顶，另返membershipCategory可显示New member/Member；REGULAR显示New member或Member。不将学生页“试听学生”等同于本次Trial。未来课次重算；首次提交反馈保存categorySnapshot（兼容TRIAL/NEW/EXISTING主标签）及membershipCategorySnapshot，以课次日期判断；已提交历史不因续购、今天日期或后来补录改变。

## 7. 交付边界

Admin四个主入口：我的待办、课表、学生、权益管理。Teacher仅前三个；学生列表也有三Tab但限定本人授课关系且不显示购买明细。日历与列表同一数据源。学生默认试听学生Tab，搜索/分页/Tab在URL，切Tab重置页码，计数按当前搜索与权限统计。新增学生弹窗录初始试听课时，不在学生编辑里改余额；详情可以跳转权益管理并预选学生。购课成功跳到该学生所在Tab并刷新数量/详情/权益/名单/受影响待办；默认建档成功回试听学生Tab。

权益管理列表按本人学生展示两个池的余额/占用/可用；支持搜索、分页与逐人流水，新增弹窗仅学生、购买课时、可选备注，提交按钮“确认发放”。没有套餐下拉、价格计算、支付按钮或卡片式宣传。错误就地提示且保留输入；二次点击复用同一请求幂等键，成功后的新购课使用新键。

无需系统管理、家长管理、独立试听管理页。README区分原版已实现与本轮待开发；OpenAPI、迁移、服务和页面必须一起替换旧规则。详见plan/01、02、10及联动任务，旧PDF/验收报告不能作为新版完成证据。
