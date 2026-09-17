# 02 · 学生三Tab、建档与独立沟通

前置01、10。原学生资料/沟通已实现，本轮增量待开发。入口仍为Students.tsx与StudentDetail.tsx，服务复用students.service.ts/read.service.ts。

## API

GET /students?category=TRIAL_STUDENT|NEW_MEMBER|MEMBER&q=&page=&pageSize=，category可省略以返回授权范围全部学生供课表/权益选人，学生三Tab页面始终显式传category且默认TRIAL_STUDENT；授权scope与搜索先作用，再按统一服务端参考日期分类/统计/分页，稳定name/id排序。返回{items,total,page,pageSize,categoryCounts:{TRIAL_STUDENT,NEW_MEMBER,MEMBER},membershipAsOfDate,nextCategoryChangeAt}。每项返回membershipCategory；精确firstPurchasedAt仅负责人详情返回，不给Teacher/非负责人。GET详情保留现有授权和字段白名单。

POST /students追加initialTrialHours（整数1–10000，缺省1），owner固定当前Admin。学生与唯一INITIAL_TRIAL流水同一事务、同一幂等收据；创建失败不残留流水，同键重试不重复发放。DTO拒绝firstPurchasedAt/会员类型/任意余额。PATCH仍需本人+expectedVersion，不接受initialTrialHours和旧firstEnrolledOn；新建后不能从编辑学生弹窗再次赠试听。

沿用name1–100、yearLevel枚举、guardianName/relationship<=100、email有效、电话国际格式、wechat<=100、preferredLanguage en-AU/zh-CN、意愿备注每项<=1000。基本档案允许暂无联系人，试听预约前要求完整；同名、同家长号码允许，资料各自独立。

会员分类：没有firstPurchasedAt即试听学生；首次购课当地日到第6日是新会员，第7日起会员；续购不重置、余额0不降级。firstPurchasedAt不可手填，不以旧入学日、沟通结果、建档时间或是否已经试听推断。Teacher仅授课关系的学生，三Tab不会扩大scope。

独立POST /students/:id/communications沿用：实际联系人快照、channel、content1–2000、occurredAt、可选taskId/participantId及outcome；仅负责人，关联必须同学生，实际时间最多60秒未来容忍，日志不改变Task或会员。对应GET分页保留。

## UI

一个页面固定三个Tab：试听学生 / 新会员 / 会员学生（英文Trial students / New members / Members），Tab可显示匹配当前搜索与权限的数量。默认试听学生，URL保留category/q/page，切Tab回第1页。无额外学生类型管理页；跨当地零点或恢复前台刷新分类，购课后立即刷新并切到该学生实际类别。

顶部新增学生弹窗含学生、主要联系人、学习意愿和“初始试听课时”数字输入，默认1、min=1、step=1；只有简短字段说明。新增成功回试听学生Tab并定位/展示新学生。编辑弹窗无可写课时/会员类型/入学日。

本人学生详情展示只读类别和两池摘要，提供“权益管理/登记购课”跳转并预选studentId；其余角色隐藏入口且响应不含敏感权益字段。沿用沟通时间线、Record communication和预约入口，不建家长页。

## 验收

三个Tab互斥且数量和=同搜索授权范围学生总量，分页不漏分；第6/7日、当地零点、DST、直接购课后切Tab、续购/零余额分类正确。建档缺省1，自定义3可用3，0/负数/小数/超上限400；幂等重试只建一生一初始流水。伪造首次日期/类型/余额字段被拒；其他Admin/Teacher无权益与联系人泄漏；既有通讯权限及关闭后追加日志回归通过。
