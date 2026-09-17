# 13 · 预约弹窗与试听管理

P0，待做；前置12。pages/Trials.tsx、components/TrialBookingDialog.tsx，AdminRoute /teaching/trials；学生详情和课表名单里接预约入口。

列表列：学生、课程、班级、老师、墨尔本日期时间、状态、下一步；筛日期/状态/学生，默认本人。点击学生/课次可回到来源，不做重复档案页。

预约必须先选Inquiry，再选择availability返回课次；显示课次层级、当前人数/容量、偏好匹配和硬性禁用原因。有多个咨询先选科目，不允许手填owner/entitlement/studentId。提交成功刷新课表/名单/学生/待办/试听；失败保留选择，用409最新余位刷新候选，绝不乐观扣席位。

取消要求填写原因，开课后隐藏取消按钮，API仍校验。权益用“Remaining 1 · Reserved 1 · Available 0”一类明确文案，不把预约显示成已扣费。试听管理展示SCHEDULED但已结束时标记Awaiting result，而不是自动NO_SHOW。

验收：Admin完成建咨询→选课→预约，刷新后存在；满员无可提交假按钮；跨浏览器抢位显示冲突；取消后人数更新；教师直达路由无权限。表单空、加载、错误重试与键盘选择覆盖。
