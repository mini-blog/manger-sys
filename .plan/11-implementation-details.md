# 后续权益版本实现细则（参考，不是执行任务）

本文件承接原DESIGN中的模型、权限、事务、反馈及发放接口细则，属于**后续权益版本规格，部分后端已实现**，不作为本次Part B已实现的声明。本次提交以[DESIGN](../DESIGN.md)和[12提交验收](12-submission.md)为准。执行时只读00、目标叶子任务与本文指定节号；01–10、12只是分组索引。不得把新旧规则混用。

## 1. 模型取舍

不新建Contact、StudentContact、Inquiry、TrialBooking、StudentFeedback或通用业务引擎；联系人在Student上，预约/出勤/个体反馈在SessionParticipant上，机构与班级课表都是ClassSession查询。Course是科目目录、ClassGroup是固定班级分组，保留现有两表和seed，但本版不增加目录CRUD页面。

Student已有guardianName、guardianRelationship、guardianPhone?、guardianEmail?、guardianWechat?、preferredChannel?、preferredLanguage（en-AU/zh-CN）、learningGoals?、preferredTimes?、interestedSubjects?、firstPurchasedAt?（timestamptz，只由首次正式购课流水或经核对的迁移设置）、version；新增量是firstPurchasedAt，其余沿用已有字段。基础建档可只填姓名/年级，预约前必须有联系人姓名和至少一种联系方式；EMAIL/PHONE/SMS/WECHAT偏好须有对应字段。学生与家长姓名分别保存；联系方式不唯一，电话支持AU与海外格式。先使用原有稳定Course id，意愿只做备注，不作硬性限制。

SessionParticipant继续唯一(sessionId,studentId)，已有bookingStatus BOOKED/CANCELLED、attendance PENDING/ATTENDED/NO_SHOW、feedback?、abilityNote?、preferenceNote?、version。kind TRIAL/REGULAR沿用；取消不删除；恢复同课次预约显式执行，保留ScheduleChange。同科目换课旧行CANCELLED，目标行新建或恢复，来源/目标都留记录。反馈提交后历史参与记录不可直接修改。课时统一由EntitlementEntry流水计算，预约占用仍来自SessionParticipant，不另建预约单、钱包余额缓存或占用表。科目有参与历史（包括取消记录）后不可更改，保持历史课程语义稳定。

EntitlementEntry即课时表，同时承载发放与消费流水，不另建重复余额表。字段：id、studentId、bucket TRIAL/REGULAR、kind INITIAL_TRIAL/TRIAL_GRANT/PURCHASE/CONSUMPTION/MIGRATION、quantity（带符号整数，除MIGRATION外非零）、participantId?、actorId?、note?、sourceKey（全局唯一）、packageId?、packageSnapshot?、createdAt。各类型约束如下：

| kind | bucket / quantity | 业务来源 |
| --- | --- | --- |
| INITIAL_TRIAL | TRIAL / 固定+1 | 新建学生勾选赠送；每学生最多一条，不勾选时无此行 |
| TRIAL_GRANT | TRIAL / +1至+10000 | 课时管理手动追加试听，可多次，不赋予会员身份 |
| PURCHASE | REGULAR / +1至+10000 | 自定义购课或套餐购课；只有套餐来源带packageId及快照 |
| CONSUMPTION | 对应预约池 / -1 | 必须有participantId，每参与记录最多一条 |
| MIGRATION | 对应池 / 非负数 | 经核对的期初导入；0只用于已核对零余额会员凭证 |

SQL CHECK约束符号与类型，部分唯一索引约束初始赠送及消费来源；Service校验学生、池和来源对应，外键禁止误删历史。INITIAL_TRIAL/TRIAL_GRANT/CONSUMPTION不得带套餐；手填PURCHASE无套餐字段，套餐PURCHASE必须同时有packageId及快照。受控期初迁移数量按对账值处理。流水只追加，不开放PATCH/DELETE、负数购买、任意余额修改、赠送正式课时或退款冲正入口；误登记应经人工核对后安排带审计的修正，不直接改库覆盖历史。

LessonPackage是最小套餐目录：id、name、quantity（整数1–10000）、priceAudCents（正整数，AUD分）、active、version、createdAt/updatedAt。不建会员级别、套餐订阅、订单或支付表。本期只用seed维护预设套餐，提供只读选择API，无独立管理页；修改已有套餐须递增version，不覆盖人工配置，使用过的套餐停用而非删除。套餐发放在同事务读取active/version/quantity，写入packageId及packageSnapshot={name,quantity,priceAudCents,currency:"AUD",version}；套餐改名、改价、停用不改变历史节数、参考价或已有课时。参考价不是实收金额。无启用套餐时仍能手填正式节数，不用虚构套餐填充页面。

每个学生两个跨科目通用池，每课次1单位，TRIAL与REGULAR不能互相抵扣。remaining=sum(quantity)，reserved=count(BOOKED/PENDING且对应bucket的参与)，available=remaining-reserved；取消课次内不得残留BOOKED占用。已过期未反馈也占用；ATTENDED在同一事务写-1并结束占用，NO_SHOW只释放。不得出现remaining<reserved或available<0。不允许直接改kind来绕过消费；会员身份并不禁止TRIAL。

Student.firstPurchasedAt为首笔PURCHASE.createdAt（或经核对的MIGRATION凭证中历史首次购课时间）的只读投影，首次发放同事务设置，后续永不重置；新建学生DTO不接受它，Student PATCH也不能设置。正常登记由服务器Clock给时间，不接受客户端回填日期。旧firstEnrolledOn/isNewToClass只保留迁移兼容，不再作为会员凭证或新会员依据。真实旧数据迁移须核对，见[01迁移任务](01-models.md)。

Task字段：id,type,assigneeId,sessionId,participantId?,status OPEN/DONE/CANCELLED,reason?,sourceSnapshot?,availableAt,dueAt,version,completedAt?,createdAt/updatedAt。Teacher任务participantId必须空且唯一sessionId（按type部分唯一索引）；Admin任务participantId必填且唯一participantId（按type部分唯一索引）。SQL CHECK type与来源字段匹配。Admin任务的sessionId和participantId引用同一课次由Service校验。Admin任务在取消或反馈时保存科目、班级、老师和时间快照；以后课次改时间或替课，已发生事件的上下文不漂移。类型只两种，不开放通用任务类型配置。Admin任务增加purpose=FIRST_PURCHASE/MEMBER_CARE/REBOOKING（Teacher为空）；兼容扩展期允许旧Admin记录为空，核对导入后再加必填约束，与reason分别表达跟进目的和来源事件；购课自动关闭时记录resolvedByEntitlementEntryId；重约自动关闭时记录rebookedToParticipantId。二者均受外键及对象一致性校验。

ScheduleChange记录sessionId、可选targetSessionId/studentId/participantId、actorId、action、reason、before/after Json、requestKey、createdAt；只保存排课/名单必要字段，不保存家长联系方式和密码。CommunicationLog记录学生、可选任务/参与记录、联系人姓名及关系快照、渠道、结果、内容、实际沟通时间和作者；链接对象均必须属于当前学生，不能借id跨对象操作。

## 2. 可见范围

所有写接口沿用Cookie会话和CSRF。Admin读全局课表和学生基本数据；学生联系方式、沟通、权益余额/流水及个体销售跟进仅负责人读写。会员类型为基础分类字段，可在授权基础列表中返回；Teacher不得取得首次购课精确时间、购买数量、余额或流水。课时管理仅Admin本人学生可查可发，不继承全局课表的修改范围。名单添加/移除/换课只能操作本人学生，课次整体改时间/换老师可操作共享课次，但重查全部学生冲突并留记录。Teacher只看当前分配给自己的课次及名单，不返回家长联系人或销售日志；我的学生由这些课次参与关系获得。Task永远按assigneeId过滤，Admin也不能查询其他人的个人待办。

本切片不新增账号管理/密码重置/员工禁用/学生转交接口，避免引入与业务权限不一致的系统管理能力。负责人保持创建时分配；未来转交须同时更新未完成Admin任务的assigneeId，历史作者不改。课前替课原子修改教师任务的assignee，旧老师随即失去该课及任务权限。课后实际教师更正和结果纠错需后续受控审计流程，本版不开放通用PATCH绕过。

## 3. 排课和预约事务

POST/PATCH修改都用DTO校验，拒绝未知字段；列表有分页、稳定排序和用户scope。写操作使用Serializable事务，P2034/P2002最多尝试3次。当前以事务级pg_advisory_xact_lock(73192461)统一串行化短业务写操作；锁后重读权限、影响集合及约束。Serializable冲突重试处理等待锁时已获取的旧快照。所有业务命令都经过Commands，读取和LLM不占锁。此规模下先用统一写锁降低实现复杂度，更大并发再按Teacher→Student→ClassSession排序细分。所有外部LLM调用在事务外。

只预约/修改未来SCHEDULED课次。冲突半开区间a.start < b.end && b.start < a.end；检查教师、班级和全部BOOKED学生，取消课次不参与。容量只计BOOKED。Teacher资格验证role=TEACHER。只要有参与历史（包括已取消）就禁止更换Course和ClassGroup；可以调整老师/时间/容量，但不得冲突或超容量，须明确确认受影响学生及写原因。

TRIAL预约检查学生归属、联系人、试听available>=1、重复名单、所有科目时间冲突。REGULAR检查已购课及正式available>=1。不限每生每科目一次，累计试听发放多节可预约多次，但每次各占1；不同科目也共享同一池。Teacher不直接发放权益。联系资料不足与余额不足使用不同错误码，不能用填入入学日解决余额不足。

取消后同课恢复预约使用原行+version并重置为BOOKED/PENDING；必须未开始、无历史已提交出勤、权益可用、无冲突且有席位。同科目换课必须一个事务：验证目标（计算可用时排除自身旧占用）、旧行取消、目标新建/恢复、写双向变更，再处理关联跟进任务；目标满员等失败旧预约保持。不允许把TRIAL静默改REGULAR，同课次试听身份保留；购课后的后续课另加REGULAR。

同一来源Admin跟进Task只保留一条：取消创建/重开reason=CANCELLED；恢复或换课成功只关闭本来源OPEN/REBOOKING跟进并关联目标参与，reason=REBOOKED；之后新的结果提交按有效participant来源创建/重开同一条，reason=TRIAL_COMPLETED/NO_SHOW，并用当前学生owner设assignee。取消/未到purpose=REBOOKING；试听到课按事务内当前会员身份设FIRST_PURCHASE或MEMBER_CARE。已完成的沟通日志不改；排课触发的任务变化随ScheduleChange记录，人工跟进变化随CommunicationLog记录；重复请求不追加多份。

所有可重试命令携带Idempotency-Key(UUID)。技术表MutationReceipt唯一(userId,operation,key)，保存规范化请求hash及最小响应；必须包含路径对象ID避免相同正文不同对象混淆。权限验证后，同键同请求返回旧结果、同键不同请求409。receipt与业务同事务，事务失败不保留成功记录；技术表不生成页面。反馈另有源状态唯一保护，换一个幂等键也不能重复消费或建任务。

## 4. 老师反馈和待办

每个有效ClassSession创建时预建一条LESSON_FEEDBACK任务：assignee=teacherId，availableAt=endsAt，dueAt=nextMelbourneDay17(endsAt)。查询只返回availableAt<=Clock.now且符合状态的本人任务；无需cron。历史seed用幂等方式补任务，取消课次关闭任务。未来调整课次同步修改任务availableAt/dueAt及assignee，不能改课后留下旧任务。

未提交课次状态：开始前Upcoming；开课中In progress；结束后Awaiting feedback；feedbackSubmittedAt非空为Feedback submitted。只是展示派生值，不把时间到当作学生ATTENDED。

POST /sessions/:id/feedback只接受当前教师，在endsAt之后提交：expectedVersion、summary?、students[{participantId,attendance,feedback?,abilityNote?,preferenceNote?}]。必须恰好覆盖本课全部BOOKED成员，无重复、无他课ID；全班总结可选，到课试听必须个人feedback，NO_SHOW不强迫写虚构观察。REGULAR也支持可选个人反馈。空课允许明确提交空名单完成老师任务，不产生Admin任务。

单事务检查每人的有效占用，写每人结果及到课者对应池唯一CONSUMPTION流水（正式课同样扣1、未到不扣）、课次feedbackSubmittedAt、老师任务DONE、每名TRIAL的Admin任务。到课生成TRIAL_COMPLETED，purpose由当前会员身份确定；未到生成NO_SHOW且purpose=REBOOKING，dueAt按原课次结束的下一当地日17:00；晚补录不掩盖延误。同结果（全部字段标准化）重试返回原值，修改已提交结果409。没有反馈提交就不创建“试听已完成”的销售跟进；Admin可从课表查看本人学生所在课次仍待老师反馈，但不能读取老师私人任务。

## 5. 跟进、沟通与AI

Admin我的待办按到期排序，含取消/未到/到课三种明确原因。独立POST /students/:id/communications可在预约前、待上课、跟进关闭后追加记录；不要求Task OPEN，不能用沟通记录绕过Task状态变更权限。记录实际联系人姓名/关系快照、渠道EMAIL/PHONE/SMS/WECHAT/IN_PERSON、occurredAt和正文；渠道校验使用所记录的实际联系信息，首版默认当前联系人，不提供多联系人管理。

POST /tasks/:id/follow-up只允许本人TRIAL_FOLLOWUP OPEN：expectedVersion、communication正文、outcome NO_ANSWER/CONSIDERING/INTERESTED/NOT_INTERESTED/RESOLVED、nextDueAt?、closeReason?。前三者保持OPEN且nextDueAt未来；NOT_INTERESTED关闭，RESOLVED只用于会员回访或无需重约的服务处理，均须原因。取消客户端ENROLLED/firstEnrolledOn写入，不能用一句“已报名”或关闭待办变会员。历史ENROLLED日志保留展示，不据此伪造购课记录。购课入口带studentId进入课时管理并预选REGULAR，确认发放才完成首次购课。

POST /entitlements/grants只限负责人Admin，Idempotency-Key必填；按以下互斥结构校验，所有quantity均为1–10000的整数、note可选且<=1000字：

```ts
// 三选一；mode仅正式课时需要。路径统一带/api前缀。
type GrantRequest =
  | { studentId: string; bucket: 'TRIAL'; quantity: number; note?: string }
  | { studentId: string; bucket: 'REGULAR'; mode: 'CUSTOM'; quantity: number; note?: string }
  | { studentId: string; bucket: 'REGULAR'; mode: 'PACKAGE'; packageId: string;
      expectedPackageVersion: number; note?: string };
```

客户端不能传kind、actorId、firstPurchasedAt、sourceKey、套餐快照或价格。TRIAL禁止mode/packageId；CUSTOM禁止套餐字段；PACKAGE禁止quantity，不能用客户端节数或价格覆盖目录。kind由服务端推导：TRIAL→TRIAL_GRANT，REGULAR→PURCHASE。无效组合/非整数返回400；套餐不存在404，已停用或版本改变409，刷新选项后重新确认，不静默改成其他数量或套餐。

发放事务：校验负责人→读取及校验套餐（如有）→写唯一sourceKey流水→仅REGULAR在firstPurchasedAt为空时设置首次时间并递增Student.version→仅REGULAR关闭该学生所有OPEN/FIRST_PURCHASE任务（reason=PURCHASE_RECORDED、resolvedByEntitlementEntryId指向本笔、递增Task.version）→写receipt。TRIAL不改会员日期/学生分类，也不关闭、重开或创建跟进任务。返回{entry,balances,membershipCategory,firstPurchasedAt,closedTaskIds}；试听返回closedTaskIds=[]。一个环节失败全部回滚，重试不重复加课；续购不重设日期。即使没有试听预约或建档时未勾选赠送，也可以追加试听或直接购课。发放不伪造CommunicationLog、不自动预约。流水createdAt显式取本次Clock.now，与首次日期严格一致；重放响应为原结果，UI应refetch当前状态而非覆盖最新缓存。

同键同请求重试须在当前授权通过后先查收据，返回首次成功的套餐快照与结果；其后套餐停用/改价不使已成功请求失效。同键不同正文409；失败事务无成功收据。套餐版本过期后修改请求参数须使用新键；响应丢失保留原键重试。两个不同键的合法购买是两笔发放，不按学生+节数去重正常续购。
购课不关闭REBOOKING或MEMBER_CARE，避免丢失未到重约/教学回访；若购课在老师反馈之前，该试听结束后直接建会员回访而不是首次购课任务。反馈与购课共用写锁，无论先后顺序最终都不残留已购课学生的开放FIRST_PURCHASE。人工跟进与购课并发用Task.version阻止旧页面覆盖自动关单。

沟通日志与人工任务更新同事务；关闭后仍可独立记录。reopen需原因、未来时间和version；仅当本来源参与未恢复为BOOKED/PENDING且明确关联的重约目标不再BOOKED时允许重开，不能因其他同科目PENDING而拒绝；已会员禁止重开FIRST_PURCHASE（409 MEMBER_ALREADY_PURCHASED），会员关怀可以独立记沟通或处理该学生新产生的MEMBER_CARE任务。

千问入口绑定taskId，限定该学生、该科目、本次课堂反馈与相关人工沟通，不混用其他科目购买意向。加入服务端推导的会员类型、任务purpose；仅声明人工购课记录，不声明支付已核验。会员任务生成学习适应/试听感受回访，不能生成“首次报名”销售话术；不传具体购买数量/财务流水。响应schema：summary、observations[{text,sourceIds}]、questions[]、suggestedNextStep、talkingPoints[]、subject、messageDraft；后两项键必有、可为null，服务端另附输入快照的studentVersion/taskVersion；en-AU/zh-CN，EMAIL需subject/body，PHONE/IN_PERSON用提纲。来源ID逐项验证，文本长度上限，额外字段拒绝。无依据不推断；不输出成交百分比、优惠或虚构付款结论。返回source=llm/template，由服务端附加生成时间和来源记录ID。

用户点“生成建议”才调用；无key、超时、上游错误、JSON或引用无效时返回同渠道模板，任务始终可人工处理。10秒超时，按用户限频。仅发送必要文本，屏蔽档案内已知姓名/联系方式及可识别邮箱/电话模式；自由文本脱敏不是完备的隐私保证，录入者仍应避免额外个人敏感信息；输入资料不能修改模型规则，无工具写操作。草稿暂留页面内存，不算沟通、不改Task，复制不算发送。API key只在后端，真实provider成功与降级需分别验证。


## 6. 时间、标签与学生建档

所有时间点存timestamptz、API带offset、展示Australia/Melbourne。学生分类由firstPurchasedAt推导：无日期为TRIAL_STUDENT；首次购课当地日期d起[d,d+7日)为NEW_MEMBER；达到d+7日为MEMBER。7日为日历日而非168小时；续购和余额归零不改d。学生页参考今天；课次名单参考课次日期，早于d视为当时非会员。首次提交反馈保存categorySnapshot及membershipCategorySnapshot，历史不因今天变化而重算。

学生列表返回membershipAsOfDate、下一个当地零点的nextCategoryChangeAt；前端到点、恢复前台及正式购课成功刷新；分类、计数、分页使用同一时点。TRIAL参与始终置顶且主标签为Trial，可附加New member/Member；REGULAR按会员类别展示，不能把学生Tab等同于本次预约类型。

POST /students接收giftTrialCredit?: boolean，省略true、false不被默认值覆盖，null/字符串/数字拒绝。owner取当前Admin；学生、按需INITIAL_TRIAL +1及receipt同事务，false不写零流水。拒绝旧initialTrialHours、客户端quantity/firstPurchasedAt/会员类别/余额。PATCH不得接收giftTrialCredit或补赠；选择项不是可反复切换的持久状态，后续发课仅通过课时管理。

## 7. 页面与查询契约

未来Admin菜单为我的待办、课表、学生、课时管理；Teacher前三项。学生一个页面三Tab，默认试听学生，URL存category/q/page，切Tab回第一页，计数按相同搜索/权限计算。详情可预选学生跳课时管理；非负责人不返回联系方式及权益明细。

课时管理列表包含零余额无流水学生，展示两池余额/占用/可用与只读流水。“新增课时”默认试听；从首次购课待办进入预选正式/CUSTOM。试听手填节数，正式二选一自定义/套餐，套餐固定数量只读。切换清除不适用字段，无套餐可用自定义；确认显示增加的池与节数，错误就地保留输入，无宣传卡片或支付按钮。

GET /students?category=&mine=&q=&page=&pageSize=，category可省略供选人，mine=true保留本人学生筛选兼容，学生页始终传Tab；返回items/total/page/pageSize/categoryCounts/membershipAsOfDate/nextCategoryChangeAt。GET /entitlements?q=&studentId=&page=&pageSize=限本人学生；GET /students/:id/entitlements返回摘要；GET /students/:id/entitlement-entries?bucket=&page=&pageSize=按createdAt/id倒序。GET /lesson-packages?q=&page=&pageSize=仅Admin、仅active，返回id/name/quantity/priceAudCents/currency/version。page>=1、pageSize1–100，稳定排序，字段白名单。

追加试听刷新余额/流水/相关选人；正式发放额外刷新三Tab/学生详情/名单/受影响待办，并丢弃旧AI草稿。从学生页返回时定位最新分类，不强迫所有入口发放后跳学生页。OpenAPI用互斥结构描述三种发放请求，common同步生成类型，前端不能绕过服务端判断。

## 8. 工程与增量交付

pnpm workspace：packages/api和web以workspace:*依赖common；共享枚举/纯类型归common，DTO校验与Prisma归api，OpenAPI类型由common/src/generated/api.d.ts导出。构建顺序common→api/web，依赖冻结安装。Compose开发挂载源文件支持热更新；生产镜像内构建，前端Nginx提供静态资源和/api代理，仅发布前端入口，数据库与API不发布端口。启动为数据库健康→迁移完成→API健康→前端；生产不自动seed。工程配置已实现，不等于权益业务已完成。

增量验收见[09](09-acceptance.md)：赠课true/false、追加试听不变会员、正式自定义/套餐购课、历史快照、幂等/事务回滚、余额占用、会员日期/DST、权限及跟进联动。旧库需核对后增量迁移，不覆盖历史，不清库。当前后端局部验收已执行，见[阶段验收](../docs/ENTITLEMENT-MILESTONE.md)；预约/消费/页面及整体切换仍待后续验收。


## 9. 与现有实现的衔接

字段与服务是否已存在以代码为准：Student联系人、Participant出勤/反馈、ScheduleChange、CommunicationLog及MutationReceipt已存在；不要按旧文字重复建表。新领域辅助方法均接收外层tx，购课与反馈共用followup-policy，不让EntitlementsService和TasksService循环互调。

多试听预约须采用[00](00-contracts.md)的明确重约来源规则；新增预约的sourceRebookingTaskId、Task.rebookedToParticipantId及相关日志是实现此因果关系的最小字段。POST无来源就不自动关旧任务，不能保留旧closeOldFollowups的按科目批量关单行为。收到多条试听待办是合法的不同来源，不按学生/科目合并。

旧数据预检01d只读，01e只有核对凭证齐全后按B+C导入并补历史消费；无证据不能自动送1或伪造会员。schema扩展允许旧Task目的为空，收紧在09c维护窗口导入之后。新旧规则不可混部，不能让旧代码在导入后继续写旧资格数据。

现有useWrite固定把响应当{id}。新发放响应不同，10i使用局部强类型mutation并复用UUID重试思路，避免运行时把entry当根id。现有学生mine过滤必须保留，旧日期表单通过02d与07d清退；09d清退无消费者的旧API和版本化语义改变的命令收据。最终前后端整体check/build及迁移演练完成，才在09c更新已实现声明。
