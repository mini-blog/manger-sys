# StudentSys · 试听预约与课后跟进

面向澳洲中小学教培机构的内部PC应用。Admin负责学生、排课、登记课时和跟进家长；Teacher只查看本人课程、签到和逐学生评价。所有课程都是正常课程，试听/会员身份由学生资料及正式购课决定。

## 当前本地运行环境

本地入口为 [http://127.0.0.1:18080/login](http://127.0.0.1:18080/login)，使用本机配置`.env.local18080`和Compose项目`studentsys-local`，仅web暴露端口，API及数据库通过容器内网访问。下文另列可选源码开发方式。

## SQL初始化后的账号

当前库使用[sql/development-seed.sql](sql/development-seed.sql)初始化，以下均为虚构演示账号，统一密码 **`StudentSysDemo2026!`**。已有super会被复用，其原账号和密码保持不变。

| 类型 | 登录账号 | 数量 | 推荐演示 |
| --- | --- | ---: | --- |
| 超级管理员 | `super@demo.studentsys.test` | 1 | 账号管理；并不绕过学生负责人限制 |
| Admin | `admin01@demo.studentsys.test`、`admin02@demo.studentsys.test`、`admin03@demo.studentsys.test`、`admin04@demo.studentsys.test`、`admin05@demo.studentsys.test` | 5 | admin01有1条试听跟进；每人负责3名学生 |
| Teacher | `teacher01@demo.studentsys.test`至`teacher20@demo.studentsys.test`（两位数字，连续编号） | 20 | teacher01有1条待评价；teacher02有未签到学生；teacher03有未来课程 |

以下为首次初始化时的数据，课程日期相对SQL首次执行日计算；会员分类和任务可见性会随时间及操作变化。数据包括15名学生（5试听、5新会员、5会员）、3节课程（墨尔本昨日2节、明日1节）、15条预约、15条正数课时记录和12条签到扣课记录。5条教师任务中1条已完成，只有1条OPEN当前可见，另3条因未签到/未下课隐藏；Admin有1条OPEN跟进。超级管理员没有负责的学生，所以自己的课时列表为空，业务演示使用admin01。

## 启动、停止及查看日志

配置保存在本机被Git忽略的`.env.local18080`，包含独立数据库凭据、账号命令密钥、`IMAGE_TAG=local18080`、`WEB_PORT=18080`、`WEB_BIND_ADDRESS=127.0.0.1`和本机HTTP的`SESSION_COOKIE_SECURE=false`。当前使用`compose.prod.yaml`的镜像运行方式，**不挂载源码、不提供热更新**。

```sh
cd /Users/Zhuanz/work/studentSys
# 先启动Docker Desktop；重新启动已有环境，不重复初始化已有卷
docker compose --env-file .env.local18080 -p studentsys-local -f compose.prod.yaml up -d --wait

# 修改代码后重新构建并启动同一个环境
docker compose --env-file .env.local18080 -p studentsys-local -f compose.prod.yaml up -d --build --wait

# 状态、日志
docker compose --env-file .env.local18080 -p studentsys-local -f compose.prod.yaml ps
docker compose --env-file .env.local18080 -p studentsys-local -f compose.prod.yaml logs -f api web

# 停止，保留数据库卷
docker compose --env-file .env.local18080 -p studentsys-local -f compose.prod.yaml down
```

当前数据库镜像在空卷首次启动时按`001-schema.sql`、`002-development-seed.sql`顺序执行建表和演示数据；已有卷启动不会重建或补数据。本轮已在新库显式执行指定SQL并核对。需要手动执行同一文件时：

```sh
docker compose --env-file .env.local18080 -p studentsys-local -f compose.prod.yaml exec -T db \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < sql/development-seed.sql
```

SQL一次事务完成；重复导入依据完成标记跳过，不补余额、不重开任务。当前账号由SQL创建，不再额外运行旧Prisma演示seed。

## 当前功能

- 学生三Tab：试听学生、首次正式购课7个墨尔本日历日内的新会员、会员。建档记录学生性别/年龄、主要家长资料，当前负责人和录入人来自登录会话。
- 建档默认赠1节试听卡；课时管理支持追加试听、手填正式课时或选预设套餐，双池分开查询余额、占用、可用和不可变流水。
- Admin全局周日历/列表，可创建、修改科目/老师/时间、取消课程；名单仅加入/移除。只检查老师/学生时间冲突，取消保留变更历史。
- Teacher逐行签到，成功显示对勾并扣1节。未签到到下课释放占用；补签重新校验可用课时。
- 加入试听生预建隐藏评价任务，签到且下课后进入本人列表及通知；教师独立评价后为当前负责Admin生成跟进。
- Admin记录沟通、顾虑、核心问题和原因标签，选择有意向/考虑中/不报名/未联系上，均完成本次任务。正式发卡才成为会员；历史跟进结果不会被后续购课覆盖。
- 超级管理员独享账号管理：新增、编辑、重置密码、停用Admin/Teacher，Admin停用须交接，Teacher须处理未完成教学。

**本轮排除AI对接。** 千问provider基础代码保留，新流程的AI上下文/页面/真实调用验收尚未完成；当前页面提供人工评价及沟通闭环，不展示未验收的建议入口。测试中的模板或mock不代表真实千问成功。

非AI部分的最新实测结果和限制见本地[验收记录](docs/NON-AI-COMPLETION.md)。历史报告只证明对应阶段，不能代替本轮回归。

## 工程结构

pnpm workspace：`packages/web`（React、MUI、React Query）、`packages/api`（NestJS、Prisma、PostgreSQL）、`packages/common`（枚举/纯类型/OpenAPI生成类型）。前端不导入后端源码。OpenAPI输出为根目录`openapi.json`。

## 本机开发

需要Node 22.12–22.x、pnpm 10和Docker。

```sh
cp .env.example .env
pnpm install --frozen-lockfile
docker compose -f compose.dev.yaml up -d --build --wait db
pnpm dev
```

前端默认5173，后端3100，PostgreSQL5433。`.env`中的DATABASE_URL应与数据库端口/凭据一致；账号命令需设置随机`ACCOUNT_COMMAND_HASH_SECRET`，可用`openssl rand -hex 32`生成。勿将真实密钥提交Git。

当前开发/演示服务器不做数据库升级迁移。数据库镜像在空卷首次启动时建立当前结构；已有开发库结构过旧时，确认项目名后单独重建本项目开发库。更新镜像或重启不会删除数据，也不会自动更新已有表结构；`pnpm db:init`仅供全新空库建表，不要对已有库重复执行。生产或其他项目数据库不能按开发重建处理。

## Docker Compose

开发环境挂载前后端和common源码，支持热更新；仅数据库→API健康→web三个服务依次启动，没有migrate容器：

```sh
docker compose -f compose.dev.yaml up -d --build
```

部署镜像在容器内构建，Nginx为唯一宿主入口，API和数据库只在容器网络内：

```sh
cp .env.prod.example .env.prod
# 设置独立数据库密码、账号命令密钥与实际HTTPS cookie配置
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build
```

生产默认8080，HTTPS应设置`SESSION_COOKIE_SECURE=true`；只在本机HTTP验收时设false。当前镜像用于开发服务器，首次空卷会自动写入上文SQL演示数据。不运行全局Docker清理命令。

`packages/database/Dockerfile`基于官方PostgreSQL17构建，按顺序内置`sql/schema.sql`（完整建表、CHECK、唯一索引及负责人触发器）和`sql/development-seed.sql`（演示数据）。仅首次空卷启动执行；TCP健康检查等待两者完成才启动API。已删除Prisma迁移历史，不再运行迁移命令。CI及隔离测试通过`pnpm db:init`直接执行相同建表SQL，再用TypeScript seed准备测试专用数据。后续结构修改需同步Prisma schema与建表SQL。

## GitHub Actions 发布到阿里云

`.github/workflows/deploy.yml` 在推送 `main` 时自动运行，也可在 Actions → **Deploy StudentSys** → **Run workflow** 选择 `main` 手动发布。其他分支及PR只检查，不部署。部署先调用现有check工作流；检查失败不会上传或修改服务器。

当前目标是 `admin@47.79.232.38:22`，目录 `/opt/studentsys`，临时访问入口为 <http://47.79.232.38>。仓库 **Settings → Secrets and variables → Actions → Secrets** 只需添加 `DEPLOY_SSH_KEY`，值为已授权到服务器的无口令SSH私钥完整内容。主机公钥固定在 `scripts/deploy/known_hosts`；重建服务器后应先通过可信控制台核对新指纹，再更新此文件。

GitHub runner构建Linux amd64的web/api/db三个镜像，压缩后通过SSH上传；服务器执行 `scripts/deploy-server.sh`，不在1 GiB机器上安装依赖或编译，也不需要阿里云AccessKey或镜像仓库Token。部署账号需具备免密sudo、服务器已有Docker及Compose，22/80端口可达。

共3个镜像及3个容器：web内含Nginx、api、db为PostgreSQL。构建后执行 `DEPLOY_TEST_IMAGE=studentsys-db:<tag> node scripts/test-database-image.mjs` 验证真实空库初始化、触发器及重启保留数据，再执行同一变量下的 `node scripts/test-deploy-server.mjs`，以模拟Docker命令验证部署顺序和失败处理，最后上传镜像包。

首次发布自动生成独立数据库密码和账号命令密钥，保存为服务器 `/opt/studentsys/.env.prod`（root所有，权限600）；后续保留该文件及数据库卷。当前使用80端口HTTP，`SESSION_COOKIE_SECURE=false`，仅作为测试/演示入口；配置HTTPS时将其改为true。千问默认未配置。部署不上传本地.env；数据库首次空卷启动自动导入SQL演示账号及业务数据，已有卷保持原数据。

发布顺序：校验压缩包 → 加载镜像 → 停止旧web/api → 数据库健康 → API健康 → web及代理API健康 → 标记current版本。更新有短暂中断；数据库初始化或健康检查失败会停止发布，不自动删库重建。`/opt/studentsys/current`仅在健康检查通过后更新，失败发布需从对应 `releases/<SHA>-<run>-<attempt>` 目录检查。发布结果以Actions记录及服务器健康检查为准。

首次空卷已自动创建上文SQL演示账号和业务数据，无需再次初始化超级管理员。只有未导入SQL且没有超级管理员的环境，才使用`pnpm accounts:bootstrap`，在后端环境提供`SUPER_ADMIN_EMAIL`、`SUPER_ADMIN_NAME`、`SUPER_ADMIN_PASSWORD`。该命令只创建账号，不准备业务数据。

镜像与发布目录保留用于诊断；清理时只处理确认过的StudentSys旧版本，不删除数据库卷。

## 验证命令

```sh
pnpm check
pnpm test
pnpm test:entitlements
pnpm build
pnpm openapi:generate
node scripts/check-compose.mjs
```

`test:entitlements`创建并清理自身隔离PG容器，验证数据库约束、权限、冲突、余额、并发、回滚、签到评价、四种跟进、购课竞态、账号和seed重复执行，并运行基础HTTP与演示查询。`pnpm test:integration`针对已建表及准备测试seed的DATABASE_URL做HTTP检查；完整写入回归使用前一个隔离命令。浏览器和Compose实测另记于验收文档。

旧整课反馈、trial-eligibility、move、restore、reopen端点返回404；不能通过旧ENROLLED/NO_ANSWER/nextDueAt契约写入。旧专项测试已随退役功能移除，有效的权限/冲突/课时/事务断言保留在现行测试。

## 设计与交付边界

设计依据见[DESIGN.md](DESIGN.md)。
