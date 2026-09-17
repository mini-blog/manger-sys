# 05 · 家长与学生关联 API

P0；待做；前置03。数据库使用 Contact（UI叫家长），不创建家长账号。

## 数据

Contact: id,name(1–100),email?,phone?,wechatId?,preferredChannel EMAIL/PHONE/SMS/WECHAT,preferredLanguage en-AU/zh-CN,status ACTIVE/ARCHIVED,version,createdAt/updatedAt。
StudentContact: id,studentId,contactId,relationship PARENT/GUARDIAN/SELF/OTHER,isPrimary,createdAt；唯一(studentId,contactId)，同学生最多一名primary用部分唯一索引。主要联系人不等于法定监护权。

## 契约 / 文件

src/contacts/{controller,service,dto}.ts。GET /contacts 分页q，查询范围为关联当前Admin负责学生；姓名/邮箱/电话搜索仅在此范围内。POST /students/:id/contacts {name,渠道字段,preferredChannel,preferredLanguage,relationship,isPrimary} 原子创建和关联。POST /students/:id/contact-links {contactId,relationship,isPrimary} 只能链接本人可见联系人；切主联系人同事务取消旧primary。

PATCH /contacts/:id {可编辑字段,expectedVersion} 若存在其他负责人关联孩子则409 CONTACT_SHARED_LOCKED；PATCH /students/:id/contact-links/:linkId 只改该学生的relationship/isPrimary。GET /contacts/:id只返回本人负责孩子。首版不删除关联，不做跨顾问共享修改和联系人合并。

至少email/phone/wechatId一种非空；偏好渠道对应数据必须存在。电话采用libphonenumber-js解析默认AU并保存E.164，允许海外号码；email校验，空字符串归null。联系人姓名/邮箱/电话均不作全局唯一；重复时提示但不自动合并。教师所有端点403。

## 验收

只有邮箱、只有+61电话、只有微信都能建；EMAIL无邮箱400；父母两个孩子正确关联，切primary不出现两个；关联其他顾问联系人403；共享联系人修改409；新建关联失败不遗留孤儿联系人；家长列表不泄漏其他孩子。
