# 03 · 学生档案 API

P0；列表和基础新建已实现，其余待做。前置02；现有 src/students/students.ts 不要重复创建路由。

## 数据 / 文件

拆 students.controller/service/dto.ts。Student 增加 status ACTIVE/ARCHIVED（默认ACTIVE）、version、createdAt/updatedAt；yearLevel继续用 Foundation、Year1–12的现有带空格标签、Not assessed；学习能力按科目记录，不用年级替代能力。暂不收出生日期、身份证、住址。ownerAdminId新建取当前Admin，禁止客户端指定。

## 契约

GET /students 保持现有分页和q，加status（默认ACTIVE）；Admin全部基础数据，Teacher通过ACTIVE参与记录且课次未取消的授课关系筛选，包含历史。GET /students/:id：基础信息，canEdit；负责人另带联系人、咨询摘要的授权子资源链接；Teacher只带本人课次教学记录，不返回owner私人数据。不得先查所有学生再内存裁剪。

POST /students {name(1–100),yearLevel} ->201；同名允许。PATCH /students/:id {name?,yearLevel?,expectedVersion} 负责人；POST /students/:id/archive {expectedVersion}，有未来ACTIVE课次或开放咨询/试听/待办时409 ACTIVE_DEPENDENCIES，禁止自动清除。基本建档可无联系人，咨询提交另设校验。

## 验收

分页边界、q空白、伪造owner/role字段400、未登录401；Teacher POST403，列表和详情对象范围一致，任意ID不能取其他学生；Admin跨负责人可读基础但不能改；冲突版本409；缺姓名拒绝、同名两个学生成功。teacher当前列表接口新增实体状态后要同步过滤规则和集成测试。
