# StudentSys · 试听预约与课后跟进

> AI v2前后端已适配，本地18080已恢复：双富文本、半星评价、已购买/未购买跟进和学生报告待办可用。千问未配置时显示失败并允许重试；真实调用尚未验收。线上环境未修改。

面向澳洲中小学教培机构的内部PC应用。Admin负责学生、排课、登记课时和跟进家长；Teacher只查看本人课程、签到和逐学生评价。所有课程都是正常课程，试听/会员身份由学生资料及正式购课决定。

## 当前本地运行环境

本地入口为 [http://127.0.0.1:18080/login](http://127.0.0.1:18080/login)，使用本机配置`.env.local18080`和Compose项目`studentsys-local`，仅web暴露端口，API及数据库通过容器内网访问。下文另列可选源码开发方式。

## SQL初始化后的账号

当前库使用[sql/development-seed.sql](sql/development-seed.sql)初始化，以下均为虚构演示账号，统一密码 **`StudentSysDemo2026!`**。已有super会被复用，其原账号和密码保持不变。

| 类型 | 登录账号 | 数量 | 推荐演示 |
| --- | --- | ---: | --- |
| 超级管理员 | `super@demo.studentsys.test` | 1 | 账号管理；并不绕过学生负责人限制 |
| Admin | `admin01@demo.studentsys.test`、`admin02@demo.studentsys.test`、`admin03@demo.studentsys.test`、`admin04@demo.studentsys.test`、`admin05@demo.studentsys.test` | 5 | admin01有1条试听跟进；admin01–04各4名学生，admin05负责3名 |
| Teacher | `teacher01@demo.studentsys.test`至`teacher20@demo.studentsys.test`（两位数字，连续编号） | 20 | teacher01有1条待评价；teacher02有未签到学生；teacher03有未来课程 |

以下为首次初始化时的数据，课程日期相对SQL首次执行日计算；会员分类和任务可见性会随时间及操作变化。数据包括19名学生（8试听、6新会员、5会员）、3节课程、19条预约、20条正数课时记录和16条签到扣课记录。9条教师任务中5条已完成；5条Admin跟进中1条未完成、3条未购买、1条已购买，另有3条AI报告待办。样例READY报告明确标为fixture，不代表真实千问调用。超级管理员没有负责的学生，所以自己的课时列表为空，业务演示使用admin01。

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
- 学生基本信息富文本供任课老师查看，Admin备注仅负责人可见；教师填写两项半星评分和富文本备注。
- Admin选择已购买/未购买；已购买须已登记正式课时，未购买填意愿、原因、备注。联系不上不填意愿。未购买完成后原子创建独立学生报告待办。
- 报告支持生成、失败重试、证据查看、过时重生成及阅读确认；报告和跟进仅受派负责人可见。正式购课不自动关闭跟进。
- 超级管理员独享账号管理：新增、编辑、重置密码、停用Admin/Teacher，Admin停用须交接，Teacher须处理未完成教学。

**真实千问报告生成、容器入库与阅读确认已验证。** 配置后端环境变量`QIWEN_API_KEY`、`QWEN_BASE_URL`（OpenAI兼容v1地址）、`QWEN_MODEL`，重建/重启API。运行`pnpm test:qwen`只发送虚构数据检查真实模型结构。成功mock仅用于自动化验证，不代表真实调用成功。验收证据见本地[AI v2记录](docs/AI-V2-VERIFICATION.md)。

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

首次发布自动生成独立数据库密码和账号命令密钥，保存为服务器 `/opt/studentsys/.env.prod`（root所有，权限600）；后续保留该文件及数据库卷。当前使用80端口HTTP，`SESSION_COOKIE_SECURE=false`，仅作为测试/演示入口；配置HTTPS时将其改为true。千问默认未配置。部署不上传本地.env；数据库首次空卷启动自动导入对应版本SQL演示账号及业务数据，已有卷保持原数据。

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

`pnpm test:integration`或`pnpm test:ai`创建并清理独立PostgreSQL容器，加载AI v2建表和seed，验证新流程、权限、重复提交、课程冲突、预约释放、签到扣课、购买分支、报告失败/并发/过时和账号交接。`test:entitlements`现为同一套新版测试入口；旧文本反馈和自动购课关单的测试矩阵已不作为当前验收。`pnpm test`执行评分、富文本、报告结构、provider传输和原有日期/密码单测。浏览器和Compose实测另记于验收文档。

旧整课反馈、trial-eligibility、move、restore、reopen端点返回404；不能通过旧ENROLLED/NO_ANSWER/nextDueAt契约写入。旧专项测试已随退役功能移除，有效的权限/冲突/课时/事务断言保留在现行测试。

## 设计与交付边界

设计依据见[DESIGN.md](DESIGN.md)。

### AI环境变量与部署

密钥名称统一为 `QIWEN_API_KEY`，与 GitHub Repository Secret 同名。地址和模型分别为 `QWEN_BASE_URL`、`QWEN_MODEL`（GitHub Repository Variables，可覆盖默认值）。当前按模型文档默认使用 `https://dashscope.aliyuncs.com/compatible-mode/v1` 和 `qwen3.8-flash`。

本地将三项放入根目录 `env.local`（已排除 Git 和 Docker 构建上下文）。直接启动 API / `pnpm test:qwen` 会读取它，已注入的进程变量优先。当前 18080 容器环境需要显式传入：

```sh
docker compose -p studentsys-local --env-file .env.local18080 --env-file env.local -f compose.prod.yaml up -d --build api web
```

GitHub Actions 从 `secrets.QIWEN_API_KEY` 和上述 Variables 读取配置，通过 SSH 标准输入传输，由部署脚本写入服务器 `/opt/studentsys/.env.ai`（root、0600），Compose 使用第二个 `--env-file` 覆盖 AI 配置。只注入 API 容器，不写入前端或镜像；数据库配置仍保存在原 `.env.prod`，更新 AI 密钥不会重建数据库。缺失密钥时部署明确失败；地址和模型可由 Variables 覆盖。变更需提交并运行工作流后才会在服务器生效。


报告提示词位于 `packages/api/src/workflow/prompts/student-report.*.ejs`，固定系统模板与不可信学生记录分离；EJS只编译仓库模板，不编译用户内容。Schema来自 `report-schema.ts`，请求使用严格 `json_schema`；评分通过1–5半星枚举表达，服务端另校验评分、原因与来源引用。成功报告存入 `StudentAiReport.content`（JSONB）、`evidenceSnapshot`、`schemaVersion=1`、模型和生成时间；失败保存FAILED状态，不冒充成功。提示词版本参与输入指纹，已打开报告会在输入或模板版本变化后提示重新生成。

接口依据：[Qwen3.8-Flash](https://www.qianwenai.com/models/qwen3.8-flash#api-reference)、[结构化输出](https://platform.qianwenai.com/docs/developer-guides/text-generation/structured-output)。

### 手动重置远端演示数据库（不备份）

提交不会清库。独立工作流 `.github/workflows/reset-database.yml` 合并到main后，在GitHub → Actions → **Reset StudentSys demo database** → Run workflow，选择main，填写 `RESET_STUDENTSYS`，再次点击运行。

该操作永久删除本项目远端数据库所有数据，不备份、不拷贝旧库。脚本使用服务器 `/opt/studentsys/current` 指向的**当前已部署版本**及其数据库镜像，重新执行镜像内 `001-schema.sql`、`002-development-seed.sql`。它不会取当前仓库最新SQL，也不会顺带更新应用；需要新版SQL时先部署相应版本。保留 `.env.prod` 和 `.env.ai`，因此数据库密码及千问配置不变。

重置和发布共用GitHub并发组与服务器部署锁。删除前核验镜像、卷标签和实际挂载，只删除 `studentsys-prod_postgres_data`；停止Web/API后重建数据库，初始化和健康检查通过才恢复应用。失败时应用保持停止，没有自动回滚；修复原因后重新手动执行。数据库从未部署或卷归属不符时拒绝重置。工作流目前仅创建并本地模拟验证，尚未在远端执行。
