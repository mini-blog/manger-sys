# 04 · 双课时池预约与原子换课

前置02、03、10。原版名单操作已实现，本轮权益规则待替换。复用teaching.service.ts与10的服务，SessionParticipant仍唯一(sessionId,studentId)。

## 命令

沿用POST /sessions/:id/participants {studentId,kind:TRIAL|REGULAR}、/participants/:id/cancel、restore、move；修改携带expectedVersion、reason，move另带targetSessionId。均幂等、仅Admin本人学生。

TRIAL检查：联系人完整、未来有效课次、试听available>=1、无重复/时间冲突、有容量。会员可选TRIAL，初始发放多节可约多次；删除旧“同生同科目最多一次已到课/一个待处理”限制，不用旧来源数推导固定1余额。REGULAR检查首次购课已登记、正式available>=1，不能凭入学日或沟通结果通过。不允许静默变更kind，购买正式课也不能冲掉当前试听占用。

成功预约用BOOKED/PENDING参与行占用对应池1节，不写消费。已过期未反馈继续占用；可用不足409 ENTITLEMENT_INSUFFICIENT，附本人可见的bucket/available，不能以另一个池代扣。权限校验先于余额读取，避免泄漏。

cancel只未来有效预约：标CANCELLED、释放该池占用、不新增退款/赠课流水；TRIAL创建/重开REBOOKING取消跟进。restore用原行，重验未来/未提交/权限/可用/冲突/容量，恢复BOOKED/PENDING、关闭对应开放重约任务。来源反馈已提交不可恢复。

move保持同科目边界、保留kind；统一事务计算权益时排除旧参与自身占用，目标通过再取消旧行并创建/恢复目标、写双向变更、关闭旧重约。成功前后净占用不变，即使available=0但原来已有占用也能合法换课。目标失败原位、占用、任务均保留。目标已有效/已提交拒绝；跨科目需明确取消另约，虽然权益跨科目共用也不隐式改变原试听意愿。

## 查询

GET /sessions/:id/participants包含kind、按课次日期计算的membershipCategory、主category（TRIAL/NEW/EXISTING）或已提交快照。Trial置顶，会员可同时有Trial与New member/Member标记。名单按既有scope返回，Teacher不返回课时余额/流水；Admin个人反馈仍仅本人学生。

使用GET /students/:id/entitlements替换旧trial-eligibility?courseId=调用，前后端同次上线；删除旧单科资格接口及契约，不能保留两套相反规则。取消名单不计有效人数、不占用，恢复入口保留。

## 验收

初始1节跨科目并发约两课最多成功1；初始2节两场不冲突课均可约；购课与试听资格互不覆盖。正式可用0拒绝，有占用的available=0仍可原子换课。最后一席、同生重叠仍有并发保护；相邻允许。取消恢复不加余额、NO_SHOW释放后可重约、已到课只有仍有余额才能再约。模拟事务失败不丢旧位/占用；外人403，取消不写虚假试听完成。跨池分别验证所有边界。
