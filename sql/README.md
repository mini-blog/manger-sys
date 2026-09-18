# AI v2 开发数据库

AI v2数据库与前后端已适配。2026-09-18已备份并重建本地studentsys-local/student_sys，18080服务已恢复，线上未修改。浏览器验收会新增虚构资料并推进演示任务；初始数量以全新库执行seed为准。

- [schema.sql](schema.sql)：空库完整建表，包含原有课时/账号/负责人约束及新增评分、三类待办、报告引用约束。
- [development-seed.sql](development-seed.sql)：事务写入虚构数据，完成标记ai-demo-v2-complete保证重复执行不补余额、不重开任务。
- [verify-ai-seed.sql](verify-ai-seed.sql)：检查数据数量、负责人、签到消费、半星评分、购买凭证与报告完整性；负例写入均回滚。

账号密码仍为 **StudentSysDemo2026!**：super@demo.studentsys.test、admin01至admin05@demo.studentsys.test、teacher01至teacher20@demo.studentsys.test。

| 数据 | 数量 |
| --- | ---: |
| 账号 | 26 |
| 学生 | 19（8试听、11会员，其中初次执行时6新会员） |
| 课程 / 预约 | 3 / 19 |
| 正式购买 / 试听追加 / 初始赠送 | 11 / 5 / 4 |
| 签到扣课 | 16 |
| 教师评价待办 | 9（5完成、1当前可见、3隐藏） |
| Admin跟进 | 5（1 OPEN、3 NOT_PURCHASED、1 PURCHASE_RECORDED） |
| AI报告 | 3（NOT_STARTED、READY、FAILED各1） |

teacher01：Ruby的已完成评价、Henry的待评价及4个完整链路样例。admin01：Ruby待跟进和scenario06未生成报告；admin02：scenario07 READY样例；admin03：scenario08联系不上及失败报告；admin04：scenario09已购买完成态。所有报告待办均OPEN。

READY记录source/provider/model均为fixture，是手写样例，不能用于证明真实千问调用。日期基于首次执行日Australia/Melbourne，重复执行不移动日期。

## 执行与验证

当前本地库已执行完毕，无需再清空。手动重复导入验证：

```sh
docker exec -i studentsys-local-db-1 psql -X -v ON_ERROR_STOP=1 -U student -d student_sys < sql/development-seed.sql
docker exec -i studentsys-local-db-1 psql -X -v ON_ERROR_STOP=1 -U student -d student_sys < sql/verify-ai-seed.sql
```

新空库先执行schema.sql再执行development-seed.sql。不要把新版SQL导入仍运行旧版应用的服务器。

重建前备份：`tmp/ai-schema-backups/before-ai-v2-20260918.dump`（本地忽略文件）。可用pg_restore恢复旧结构及数据，但恢复前需确认目标库并停止连接；不提供自动删除其他库的脚本。
