# 09 · 班级管理与班级课表

P1，待做；前置08。src/classes/*、pages/Classes.tsx、ClassDetail.tsx；AdminRoute /resources/classes。

ClassGroup沿用name/targetLevel，增加description?、status、version；targetLevel是招生层级标签（1–100字符），不强制课程绑定、不把seed字符串当自动分班规则。GET /classes分页，POST {name,targetLevel,description?}，PATCH /classes/:id {同字段,expectedVersion}，POST /classes/:id/archive。创建不要求Course。归档有未来课次/有效Enrollment则409；引用历史保留。

列表显示班名、层级、未来课次数；详情有基本资料和课表链接 /timetable?classGroupId=:id，复用现有课次数据和组件。新增GET /classes/:id的基础信息；Teacher不得访问班级管理，可在自己课表按可见班级筛选。

成员页依赖26，首版不把所有历史试听生当正式班级成员。班级课程来自各ClassSession，同班数学/英语可不同；单次换科目遵守10与试听确认。

验收：同班安排两个科目展示正确；班级筛选与全局课表同一ID/人数；teacher不能通过classGroupId扩大授课数据；停用不删除历史。目录分页/错误/空态齐全。
