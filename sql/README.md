# 开发服务器演示数据

开发服务器数据库镜像首次空卷启动时，依次执行 [schema.sql](schema.sql) 建表和 [development-seed.sql](development-seed.sql) 写入虚构演示数据。已有卷不会再次执行，重启不覆盖数据。

| 数据 | 数量 |
| --- | ---: |
| 超级管理员 | 1（已有启用的super则复用） |
| 普通Admin | 5 |
| Teacher | 20 |
| 会员学生 | 10（5位新会员、5位会员） |
| 试听学生 | 5 |
| 正式充值流水 | 10，每位会员20节 |
| 试听充值流水 | 5，每位试听生3节 |
| 课程 | 3（墨尔本昨日2节、明日1节） |
| 学生预约 | 15 |
| 签到扣课流水 | 12，每位实际签到学生扣1节 |
| Admin试听跟进待办 | 1，分派给admin01 |
| 可见教师评价待办 | 1，分派给teacher01 |

另外包含1条已完成教师评价、1条未签到隐藏评价、2条未来课程隐藏评价；这些记录与学生签到、个人反馈和余额对应。充值是人工课时登记，不代表支付到账。日期按首次执行当天的Australia/Melbourne计算，重复执行不会移动课程日期。

新建账号统一密码：**`StudentSysDemo2026!`**。

- 超级管理员：`super@demo.studentsys.test`
- 普通Admin：`admin01@demo.studentsys.test` 至 `admin05@demo.studentsys.test`
- 老师：`teacher01@demo.studentsys.test` 至 `teacher20@demo.studentsys.test`

已有super的账号、密码保持不变。SQL中的密码为与后端一致的scrypt哈希；演示密码是公开样例，不作为真实人员的密码。

## 执行

首次部署空卷无需手动导入。已有正确表结构、尚未导入演示数据的库，可在**已部署服务器** `/opt/studentsys` 下执行（先将SQL文件复制到该目录）：

```bash
cd /opt/studentsys
sudo env IMAGE_TAG="$(sudo cat deployed-sha)" \
  docker compose --env-file .env.prod -f current/compose.prod.yaml \
  exec -T db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < development-seed.sql
```

本地Compose开发环境可在仓库根目录执行：

```bash
docker compose -f compose.dev.yaml exec -T db \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < sql/development-seed.sql
```

也可在数据库客户端完整执行SQL文件。全文件为PostgreSQL SQL，无需Node、Prisma或额外数据库扩展。一次事务完成，报错回滚；已成功导入时再次执行会提示跳过，不覆盖密码/学生修改、不补充值、不重开已完成任务。文件末尾输出数量统计。

可登录`admin01`查看试听01的首次购课跟进，或登录`teacher01`评价已签到的试听02。尚未签到/未下课的任务不会出现在教师待办中。SQL只插入自己的演示记录；已存在同名科目会复用，发现演示账号/ID冲突会报错，不覆盖已有数据。

不使用数据库镜像时，空库先执行`sql/schema.sql`（或配置DATABASE_URL后运行`pnpm db:init`），再执行数据SQL。建表文件包含SQL专有约束和触发器，只能对空库运行；不是升级脚本。结构变更需同步此文件与Prisma schema。
