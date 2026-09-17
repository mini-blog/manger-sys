# 10 · 权益管理与手动购课发放

前置01；新任务，待开发。复用已有Commands/Clock/权限、MUI表单、React Query和OpenAPI。此任务先实现共享权益服务与页面，预约/反馈调用及联动验收由04、06、07补齐。

## 后端与契约

新增workflow/entitlements.service.ts，提供getBalances(studentId,tx)、assertAvailable(studentId,bucket,quantity,tx,excludedParticipantId?)、grantPurchase及initialTrialGrant（仅学生创建调用）。余额按流水与有效占用查询，不存独立可手改数值；同事务、同一快照计算，禁止在锁外读余额再落库。排课取消及换课直接变更参与行，消费由06写不可变流水。

- GET /entitlements?q=&studentId=&page=&pageSize=：仅当前Admin本人学生，稳定name/id排序；返回每生两个池的remaining/reserved/available、membershipCategory、firstPurchasedAt以及分页。即使余额0也列出，不要求先上试听。
- GET /students/:id/entitlements：仅负责人，返回同样双池摘要。GET /students/:id/entitlement-entries?bucket=&page=&pageSize=：createdAt/id倒序，返回类型、带符号节数、时间、操作者、备注和可授权的来源课次摘要。禁止跨学生拼接来源。
- POST /entitlements/grants {studentId,quantity:整数1–10000,note?:<=1000}，Idempotency-Key必填。固定REGULAR/PURCHASE、actor为当前Admin、时间Clock.now；不接受套餐/金额/价格/首次日期或任意流水类型。不提供编辑/删除流水接口。

购课事务：校验负责人→写唯一sourceKey购课流水→firstPurchasedAt为空时设置并递增Student.version→完成该学生所有OPEN/FIRST_PURCHASE任务（reason=PURCHASE_RECORDED、关联本笔流水、completedAt、version）→receipt。返回{entry,balances,membershipCategory,firstPurchasedAt,closedTaskIds}。首次已存在则续购不重设时间；任务表联动与07保持一致，不能靠前端依次调接口拼事务。不关闭会员回访和重约任务，不自动排课或写虚构沟通。

同一HTTP请求重试复用键，两个不同键是两笔独立购买，不以学生+数量去重合法续购。响应丢失时保留原键重试；明确成功后才创建下一笔的新键。流入本服务的数字不允许小数、负数、字符串转换为NaN等绕过。PURCHASE是人工购课凭证，不是支付验证结果。

## 页面

Admin左菜单新增“权益管理”（Entitlements），Teacher无入口且直接路由/API拒绝。列表搜索本人学生，列学生/会员类型、试听余额·占用·可用、正式余额·占用·可用、查看流水。默认包括全部本人学生，URL studentId可从详情/跟进预选，不对外泄露其他Admin学生的权益。

“登记购课”（Record purchase）弹窗：学生搜索选择、购买课时数量（默认1，正整数）、可选备注；按钮“确认发放”（Confirm grant）。确认前展示所选学生及将增加几节正式课，提示“保留试听课时”用字段附近短文字即可，不做提示横幅。无套餐下拉、单价、澳元金额、折扣、在线支付或购买订单。

提交中禁重复点击；失败留表单和有效重试键。成功刷新权益列表/流水/学生详情/三Tab计数/名单及跟进任务缓存。从学生/待办进入保留返回位置；若由学生页返回，按最新类别选中Tab。流水只读、区分初始试听/购课/到课消费/期初迁移，无修改余额按钮。

## 验收

未试听学生购5节→新会员、试听仍1、正式5；续购3→正式8、首次时间不变；第7日起会员，余额0仍会员。初始试听3不因购课改变。管理员越权/Teacher直接POST均403；注入bucket/kind/firstPurchasedAt等400。重复同键仅加一次，同键改正文409，合法不同键允许续购；发放/身份/关单/receipt任一故障全回滚。与预约/反馈/人工跟进并发时余额及任务一致（联动任务完成后跑真实PG测试）。

本期不提供课时套餐、充值金额计算、退款、任意赠送或转让；后续套餐将固定课时与优惠价格封装为发放来源，仍复用这套不可变流水，不能替换会员分类逻辑。
