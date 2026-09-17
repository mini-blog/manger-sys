# StudentSys · 试听预约与课后跟进

面向澳洲中小学教培机构的内部PC应用。Admin负责学生、排课、登记课时和跟进家长；Teacher只查看本人课程、签到和逐学生评价。所有课程都是正常课程，试听/会员身份由学生资料及正式购课决定。

## 当前本地运行环境

目前仅运行[18080](http://127.0.0.1:18080/login)，使用`.env.local18080`和Compose项目`studentsys-local`。账号及完整启动命令见[DESIGN第9节](DESIGN.md#9-唯一本地环境账号与启动)。当前数据来自`sql/development-seed.sql`；下文通用开发命令不是额外运行中的环境。

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

当前未发布，开发服务器不做数据库升级迁移。数据库镜像在空卷首次启动时建立当前结构；已有开发库结构过旧时，确认项目名后单独重建本项目开发库。更新镜像或重启不会删除数据，也不会自动更新已有表结构；`pnpm db:init`仅供全新空库建表，不要对已有库重复执行。生产或其他项目数据库不能按开发重建处理。

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

生产默认8080，HTTPS应设置`SESSION_COOKIE_SECURE=true`；只在本机HTTP验收时设false。当前镜像用于开发服务器，首次空卷会自动写入下述演示数据。不运行全局Docker清理命令。

`packages/database/Dockerfile`基于官方PostgreSQL17构建，按顺序内置`sql/schema.sql`（完整建表、CHECK、唯一索引及负责人触发器）和`sql/development-seed.sql`（演示数据）。仅首次空卷启动执行；TCP健康检查等待两者完成才启动API。已删除Prisma迁移历史，不再运行迁移命令。CI及隔离测试通过`pnpm db:init`直接执行相同建表SQL，再用TypeScript seed准备测试专用数据。后续结构修改需同步Prisma schema与建表SQL。

## 演示与账号

开发服务器首次空卷自动执行[SQL演示数据](sql/development-seed.sql)及[账号/执行说明](sql/README.md)：1个super、5个Admin、20个Teacher、10会员/5试听、15笔充值、3节课程及试听待办。新建账号统一演示密码为`StudentSysDemo2026!`。已有卷不会自动补录；需要时可手动执行数据SQL。与下方可选的pnpm seed是两套独立演示数据。

执行seed前配置`SEED_PASSWORD`，seed不覆盖已有账号密码。演示账号：`alice@example.com`、`oliver@example.com`（Admin），`emma@example.com`、`james@example.com`（Teacher）。密码取自己的SEED_PASSWORD。

seed有周一至周日60节课程、试听/新会员/会员，以及两节已结束的固定演示课程：Emma的两条待评价、一名未签到者，以及Alice的一条已评价待跟进。重复seed不补余额、不覆盖记录、不重开任务。

1. Emma登录首页，打开“Demo · Evaluation one”，填写评价并提交，仅完成该学生任务。
2. Alice登录打开对应跟进，阅读老师反馈，记录实际联系经过与结果，完成任务；未报名仍可完成。
3. 在课时管理给该学生新增正式卡，学生转为新会员，旧人工跟进结果保持不变。
4. 从未来课表可继续演示建档、加入、修改课程及取消；只有到开课时间才可签到。

首次空卷的SQL会生成`super@demo.studentsys.test`。如果已有库尚无super，可使用以下CLI显式初始化（TypeScript seed不生成super）：

```sh
# 在后端环境设置SUPER_ADMIN_EMAIL、SUPER_ADMIN_NAME、SUPER_ADMIN_PASSWORD
pnpm accounts:bootstrap
```

角色只有ADMIN/TEACHER，super是额外账号管理能力，不绕过学生私密资料归属。停用保留历史，不物理删除人员。

## GitHub Actions 发布到阿里云

`.github/workflows/deploy.yml` 在推送 `main` 时自动运行，也可在 Actions → **Deploy StudentSys** → **Run workflow** 选择 `main` 手动发布。其他分支及PR只检查，不部署。部署先调用现有check工作流；检查失败不会上传或修改服务器。

当前目标是 `admin@47.79.232.38:22`，目录 `/opt/studentsys`，临时访问入口为 <http://47.79.232.38>。仓库 **Settings → Secrets and variables → Actions → Secrets** 只需添加 `DEPLOY_SSH_KEY`，值为已授权到服务器的无口令SSH私钥完整内容。主机公钥固定在 `scripts/deploy/known_hosts`；重建服务器后应先通过可信控制台核对新指纹，再更新此文件。

GitHub runner构建Linux amd64的web/api/db三个镜像，压缩后通过SSH上传；服务器执行 `scripts/deploy-server.sh`，不在1 GiB机器上安装依赖或编译，也不需要阿里云AccessKey或镜像仓库Token。部署账号需具备免密sudo、服务器已有Docker及Compose，22/80端口可达。

共3个镜像及3个容器：web内含Nginx、api、db为PostgreSQL。构建后执行 `DEPLOY_TEST_IMAGE=studentsys-db:<tag> node scripts/test-database-image.mjs` 验证真实空库初始化、触发器及重启保留数据，再执行同一变量下的 `node scripts/test-deploy-server.mjs`，以模拟Docker命令验证部署顺序和失败处理，最后上传镜像包。

首次发布自动生成独立数据库密码和账号命令密钥，保存为服务器 `/opt/studentsys/.env.prod`（root所有，权限600）；后续保留该文件及数据库卷。当前使用80端口HTTP，`SESSION_COOKIE_SECURE=false`，仅作为测试/演示入口；配置HTTPS时将其改为true。千问默认未配置。部署不上传本地.env；数据库首次空卷启动自动导入SQL演示账号及业务数据，已有卷保持原数据。

发布顺序：校验压缩包 → 加载镜像 → 停止旧web/api → 数据库健康 → API健康 → web及代理API健康 → 标记current版本。更新有短暂中断；数据库初始化或健康检查失败会停止发布，不自动删库重建。`/opt/studentsys/current`仅在健康检查通过后更新，失败发布需从对应 `releases/<SHA>-<run>-<attempt>` 目录检查。首次真实GitHub执行前，不能将本地检查等同于远程部署成功。

首次发布后，在服务器上显式初始化超级管理员（密码交互输入，不写入命令历史）：

```bash
sudo bash
cd /opt/studentsys
export IMAGE_TAG=$(cat deployed-sha)
read -r -p 'Admin email: ' SUPER_ADMIN_EMAIL
read -r -p 'Admin name: ' SUPER_ADMIN_NAME
read -r -s -p 'Admin password (10-128 characters): ' SUPER_ADMIN_PASSWORD
export SUPER_ADMIN_EMAIL SUPER_ADMIN_NAME SUPER_ADMIN_PASSWORD
docker compose --env-file .env.prod -f current/compose.prod.yaml exec -T \
  -e SUPER_ADMIN_EMAIL -e SUPER_ADMIN_NAME -e SUPER_ADMIN_PASSWORD \
  api node packages/api/dist/accounts/bootstrap-super-admin.js
unset SUPER_ADMIN_EMAIL SUPER_ADMIN_NAME SUPER_ADMIN_PASSWORD
exit
```

此初始化仅创建超级管理员；班级、科目及演示业务数据仍需另行准备，不能在每次发布时重复导入seed。镜像与发布目录暂保留用于诊断；定期检查磁盘并按确认的StudentSys旧版本清理，不运行全局Docker清理或删除数据库卷。

## 验证命令

```sh
pnpm check
pnpm test
pnpm test:entitlements
pnpm build
pnpm openapi:generate
node scripts/check-compose.mjs
```

`test:entitlements`创建并清理自身隔离PG容器，验证数据库约束、权限、冲突、余额、并发、回滚、签到评价、四种跟进、购课竞态、账号和seed重复执行，并运行基础HTTP与演示查询。`pnpm test:integration`针对已迁移及seed的DATABASE_URL做HTTP检查；完整写入回归使用前一个隔离命令。浏览器和Compose实测另记于验收文档。

旧整课反馈、trial-eligibility、move、restore、reopen端点返回404；不能通过旧ENROLLED/NO_ANSWER/nextDueAt契约写入。旧专项测试已随退役功能移除，有效的权限/冲突/课时/事务断言保留在现行测试。

## 设计与交付边界

设计依据见[DESIGN.md](DESIGN.md)。`.plan/`与`docs/`仅为本地计划及证据，不提交Git。AI三项、历史导入、生产切换、三页排版、公共仓库/邮件和面试时间窗口均不因本轮代码完成而自动通过；没有证据的交付条件记为未核实。本轮未提交、推送或部署。
