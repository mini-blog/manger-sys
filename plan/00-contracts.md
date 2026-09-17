# 00 · 共同约定（学生权益修订）

与DESIGN/IMPLEMENTATION共同生效。本轮待开发，旧验收不是新规则的证明；docs/archive不作为需求。

## 权限与工程

Admin读全局课表和学生基础数据，只能修改本人学生、读其联系人/沟通/课时余额及流水。共享课次编辑仍检查全部受影响名单。Teacher仅本人课次及学生教学资料，允许看派生会员标签，不返回首次购课精确时间/数量/余额/家长联系方式。权益管理所有端点只限负责人Admin。Task始终assignee本人，Admin无全局待办特权。

沿用React/MUI/React Query/openapi-fetch、Nest/Prisma/PostgreSQL，Cookie/CSRF与既有Commands。API统一/api；DTO拒绝未知字段，400输入、401未登录、403越权、404不存在、409冲突。分页{items,total,page,pageSize}，page>=1，pageSize1–100；课表数组保留。变化同步npm run openapi:generate。

写操作Idempotency-Key，编辑expectedVersion；Serializable事务、统一事务级advisory写锁、冲突有限重试见IMPLEMENTATION第3节。LLM不进入事务。所有发放、首次身份变化、自动关单和收据同事务，失败不得部分成功。

## 分类、课时、任务

- membershipCategory=TRIAL_STUDENT/NEW_MEMBER/MEMBER，服务端根据首次正式购课推导。前三类互斥；不是手填状态，不从余额/建档/旧入学日推断。
- 新会员窗口[firstPurchaseMelbourneDate,+7日)，学生Tab按今天、课次标签按课次日期，首次反馈保存快照。续购不刷新首次日期，余额0不降级。页面跨当地零点刷新。
- initialTrialHours建档时1–10000，默认1；不能通过Student PATCH修改。购课quantity为1–10000正整数，固定REGULAR PURCHASE，系统记时间；不接受价格、套餐、任意bucket/kind或回填日期。
- 两池均跨科目通用；remaining=流水和，reserved=对应BOOKED/PENDING数，available=remaining-reserved。预约占1，到课扣1且结束占用；取消/未到释放，未反馈一直占用。不同池不能抵扣。
- kind TRIAL/REGULAR是本次参与方式，会员也能选TRIAL。初始可发多节，取消旧单科一次限制；正式课预约也必须有可用余额。
- ClassSession状态SCHEDULED/CANCELLED，Participant预约BOOKED/CANCELLED、出勤PENDING/ATTENDED/NO_SHOW。时间到不算到课。
- 两类Task继续保留；Admin purpose=FIRST_PURCHASE/MEMBER_CARE/REBOOKING。购课仅自动完成开放首次购课任务；会员试听到课建回访，未到/取消仍建重约。所有关联变更有流水、沟通或排课记录为依据。

时区Australia/Melbourne、界面en-AU、时间点timestamptz；非法/双解当地时间拒绝。原firstEnrolledOn/isNewToClass兼容保留但停止业务使用，历史已提交标签不篡改。

## 页面与检查

Admin四入口：我的待办、课表、学生、权益管理；Teacher前三个。学生一个页面三Tab，切换时重置分页、保留搜索，计数跟随同一授权查询。无固定说明条、套餐广告或开发提示。错误就地展示、失败保留输入。

代码修改完成运行check/build/OpenAPI同步，权限/余额/事务需真实PG验证；UI覆盖正常/空/加载/失败。只声明实际执行结果，保留Git历史、不清库。仅改文档时做一致性检查，不声称代码通过新规则验收。
