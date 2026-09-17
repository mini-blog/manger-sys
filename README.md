# StudentSys · 试听预约与课后跟进

**开发数据约定（2026-09-17）：**当前未发布，用户已明确不需要历史数据兼容，本项目开发库可直接删除重建并重新seed。后续移除旧字段和流程时，不增加历史回填、双版本或旧收据隔离；新业务自身的流水、审计和幂等仍保留。下文旧阶段验收只是当时事实。

面向 Admin 与 Teacher 的教培内部系统。已实现学生建档 → 课表预约试听 → 老师出勤/反馈 → 负责 Admin 的个人跟进待办 → 沟通记录与结果，使用真实 PostgreSQL。家长信息内嵌学生档案，课表是具体课次的查询视图。

## 本次切片与后续设计

本次Part B演示到“Admin记录沟通和下一步”为止；预约已使用课时卡余额，反馈和跟进仍有旧流程等待替换，真实千问调用与最终回归待验证，见[提交验收](.plan/12-submission.md)。

[DESIGN](DESIGN.md)与[plan](.plan/README.md)保留的后续权益设计为：学生三Tab（试听学生/首次购课7日内的新会员/会员学生）、新增学生默认勾选赠送1节试听（可取消）、独立课时管理追加试听或正式课时、试听和正式双课时池。正式课时支持自定义节数或选择预设会员套餐；追加试听不改变会员身份，首次正式购课才成为新会员。会员可继续使用试听，续购不重置首次日期，正式余额0不降级；套餐管理页面、动态优惠及支付退款不做。

**开发进度：权益后端及学生/课时页面已完成，尚未整体切换。** 建档默认可选赠1节、学生三Tab与服务端计数、课时余额/流水、试听追加、正式自定义/套餐发放已在隔离PG及Chrome验证，见[页面阶段验收](docs/ENTITLEMENT-UI-MILESTONE.md)。新增预约已接入双池余额校验，重约仅关闭明确指定的来源待办；Student.type区分试听生与会员，卡类型与学生身份独立；新增/恢复/换课资格已统一为课时卡校验，课后扣课及部分待办联动尚未接入，新旧行为不能作为一个可发布版本混用。原用户数据库未迁移，旧seed也尚未适配新的签到流程；本期已延期01d/01e/09c，使用隔离演示库验证，不直接将中间版本视为可发布版本。

账号管理已按用户追加要求完成，见[账号管理验收](docs/ACCOUNTS-MILESTONE.md)与[前后端拆分计划](.plan/13-accounts.md)。固定Admin/Teacher角色，以额外超级权限控制账号管理入口，停用账号保留业务历史。前端任务入口见[索引](.plan/FRONTEND.md)。

**05c已完成：**名单仅保留加入与移除；取消记录只读，重新预约通过普通Add，跨课程调整分两步执行。删除Move/Restore、目标课程选择与重约来源锁定/透传，旧来源URL参数自动清理。联系人不完整不拦预约，双池余额及不足补课返回继续保留；本人学生、重复加入、提交中和课时校验仍有效。Chrome与数据库核对通过，类型检查、9项单元测试及构建通过，见[名单页面验收](docs/BOOKING-UI-SIMPLIFICATION-MILESTONE.md)。旧公开接口由09d清退，下一项06b签到命令。

**04f已完成：**名单加入/移除不再生成重约；已取消且未消费的参与行可通过Add重新加入并重新选卡。只保留学生时间冲突、权限、状态、同课唯一和对应卡可用量；加入试听身份学生预建一条隐藏评价，取消关闭、重加复用，会员用试听卡不产生试听任务。完整新版签到/待办筛选由后续任务接入，名单界面已由05c清理，见[预约简化验收](docs/BOOKING-SIMPLIFICATION-MILESTONE.md)。

**03c已完成：**课程创建/编辑仅保留班级、科目、老师与起止时间，带学生名单也可修改；取消为独立原因弹窗。课表只显示实际人数，409保留修改草稿并刷新版本，已开始/取消/有结果课程只读，Teacher无管理入口。Chrome、类型检查、9项单元测试及构建通过，见[页面验收](docs/SESSION-EDITOR-MILESTONE.md)。预约后端旧容量/联系人门槛已由04f移除；此处不代表新签到/个人评价闭环已完成。

**03b已完成：**取消未来课程会同事务取消全部有效预约和未完成的逐学生教师评价任务，释放占用；不会增加课时流水或生成重约待办。接口只需版本和原因，重复/并发与失败回滚已验证。页面已按03c收敛，见[取消验收](docs/SESSION-CANCEL-MILESTONE.md)。

**03a已完成：**课程创建/修改的排课限制只检查老师和全体有效学生的时间冲突；有名单也可改科目、老师和时间，修改同事务更新逐学生待评价任务。空课程不再生成整课待办。OpenAPI与后端验证已完成，见[课程命令验收](docs/SESSION-COMMAND-MILESTONE.md)。页面调整已由03c完成，预约容量等门槛已由04f移除，取消规则已按03b收敛；当前仍是开发中间状态。

**01g已完成：**新增逐学生教师评价任务类型、签到/个人评价时间字段、独立跟进结果及沟通顾虑/核心问题/原因标签；后者可通过现有沟通API读写，类型已生成。两份新增迁移已在隔离PG及带旧数据升级场景通过，见[验收记录](docs/CHECKIN-CONTRACT-MILESTONE.md)。新签到命令、点名弹窗、隐藏待办筛选、个人评价以及“所有人工结果均完成”的跟进命令尚未实现；旧功能仍保留到后续任务收敛。运行新代码前须对目标开发库执行现有`pnpm db:migrate`，本轮未迁移18080环境或已有预览数据库。

## 已实现（含待收敛的旧流程）

- 简洁账号/密码登录，PC常驻左菜单「我的待办 / 课表 / 学生」，右侧顶部为用户信息和真实个人待办通知，业务区独立滚动；采用紧凑字号和表格。Cookie 会话、CSRF、服务端角色和对象权限。
- 学生新增/编辑支持学生本人的性别、年龄，列表展示性别/年龄及当前负责Admin；家长字段单独保存。学生新增/编辑可录入家长姓名、关系、工作、年龄、性别、邮箱/电话及沟通偏好；StudentAdminLink保存负责人和原始录入人，旧数据录入人未知不推断。学习目标/偏好、独立沟通记录；原入学日仅作历史只读信息。Admin 只编辑本人学生；Teacher 不接收联系方式或销售记录。
- 全班周课表与列表、关键词和班级/科目/老师筛选、单次排课、改科目/时间/老师、独立取消弹窗与变更记录；人数仅显示实际人数。
- 名单加入/移除接入卡余额、学生时间冲突和本人学生权限；取消后通过Add复用参与行，不再限制容量或联系人。名单已无恢复/原子换课入口，旧后端接口及旧待办页面仍待09d清退。
- 试听优先，新会员按首次正式购课日起 7 个墨尔本日历日；历史反馈保存标签快照。
- 老师个人课后任务、完整名单出勤及逐人反馈；试听到课/未到分别产生负责 Admin 的任务。待办只属于本人。
- Admin 实际沟通、下次联系时间、关闭/重开、首次报名日期；关闭后仍可追加沟通记录。
- 千问结构化跟进辅助：来源引用校验、10 秒超时、限频、同语言/渠道模板回退；可编辑复制，不自动发送。

旧验收报告当前已移除；本阶段隔离回归见[阶段验收](docs/ENTITLEMENT-MILESTONE.md)，最终检查按[提交验收](.plan/12-submission.md)重新留证，任务状态见[plan](.plan/README.md)。本次未做收费/退款/正式课时扣费、长期入班模板、家长端、动态角色/菜单管理和自动消息发送；人工“已报名”不代表系统已收款。

## 仓库结构

采用 [pnpm workspace](https://pnpm.io/workspaces)，一个仓库统一安装依赖、锁定版本和执行检查。旧迁移报告当前不在仓库，复核命令见下方“验证命令”。

```text
packages/
  api/       @student/api     NestJS、Prisma、数据库迁移
  web/       @student/web     React、MUI、React Query
  common/    @student/common  共享类型、枚举值、时区、OpenAPI生成类型
pnpm-workspace.yaml
pnpm-lock.yaml
```

前后端通过`workspace:*`依赖common，禁止跨包相对路径导入源码。运行时常量和通用类型从`@student/common`导入；OpenAPI生成类型从`@student/common/api`进行`import type`。common不依赖NestJS、Prisma或React；服务端DTO保留校验/Swagger装饰器，Prisma数据库枚举与共享枚举用契约测试校验一致。

common同时构建CommonJS供Nest使用、ESM供Vite使用。根目录build按依赖顺序构建；dev先构建共享包和后端，再启动三包watch，共享代码变化会重新编译并重启后端。单独启动某包时先`pnpm --filter @student/common build`。API类型由`pnpm openapi:generate`写到`packages/common/src/generated/api.d.ts`，不要手工维护重复类型。

## 本地启动

需要 Node.js 22.17（`.nvmrc`）、pnpm 10.13.1、Docker。

```bash
corepack enable
cp .env.example .env  # 已有配置时跳过，不覆盖
pnpm install --frozen-lockfile
docker compose up -d db
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

前端 <http://127.0.0.1:5173>，API <http://127.0.0.1:3100/api/health>，Swagger <http://127.0.0.1:3100/api/docs>。开发数据库端口 5433；API 默认 3100，避免占用本机其他服务。更改 `.env` 端口后重启开发服务。

## 超级管理员初始化

先执行新迁移 `pnpm db:migrate`。在后端环境设置 `ACCOUNT_COMMAND_HASH_SECRET`（至少32字符，建议用 `openssl rand -hex 32` 生成），用于创建账号/重置密码的幂等指纹；不要放进前端。缺少该值时这两个命令会拒绝执行。

在本地受控环境设置 `SUPER_ADMIN_EMAIL`、`SUPER_ADMIN_NAME`、`SUPER_ADMIN_PASSWORD`（10–128字符），然后执行 `pnpm accounts:bootstrap`。脚本只首次创建，不升级既有普通员工、不修改已有super密码，也不会在Compose启动时自动运行。初始化后移除临时密码环境变量。

super登录后左侧出现「System management → Accounts」。新建Admin/Teacher、编辑姓名/邮箱、重置密码和停用均写审计；角色创建后不变。停用Admin必须交接学生及未完成跟进；Teacher有未完成教学会阻塞并提供课程链接。退出或停用不删除历史记录。

专用 `pnpm preview:entitlements` 虚构预览库另有 `super@preview.test / Preview2026!`，仅用于本地演示。普通seed不会创建super；其他环境使用自行设置的凭据。

## 演示账号与步骤

首次 seed 密码由 `.env` 的 `SEED_PASSWORD` 指定，示例为 `DemoPass2026!`，仅供虚构演示数据。

| 角色 | 账号 |
| --- | --- |
| Admin | alice@example.com / oliver@example.com / grace@example.com |
| Teacher | emma@example.com / james@example.com / sophie@example.com / noah@example.com |

Seed 提供 60 名基础学生、12 班、3 科目、当前墨尔本周 60 节课，覆盖周一到周日；另有历史演示学生/课次（待反馈、到课待跟进、未到待重约）。重复 seed 保留既有编辑、密码和已提交结果，跨周补新课次，不重复为同生同科目发放待处理试听。实际排课数量不限制为 60。

1. Alice 登录，在「学生」新建资料并填写家长姓名及联系方式。选择 Find a lesson，打开未来课次添加 Trial。
2. 预约后可在课次详情取消、恢复、换同科目课程；编辑课次须填写原因并确认影响名单。
3. Emma 登录，在「我的待办」打开历史样例 **Demo · Awaiting feedback** 对应的课次（前一周周日 12:00），标记出勤、写个人反馈并提交。真实新课只在结束后可提交；API 无改时钟后门。
4. Alice 登录，查看对应的 Trial completed 待办和老师反馈，点击 Generate suggestions；实际联系家长后另填沟通记录，选择结果和下一次时间或关闭原因。
5. 切换其他 Admin/Teacher 核对范围。历史样例已经提交时不会被 seed 重置，可查看已完成任务；自动化集成测试会创建独立数据并注入 Clock 重走全部流程。

界面时间固定 Australia/Melbourne，包括夏令时。周日允许排课，试听取消/未到不消耗资格，过期待反馈仍阻止再次预约同科目试听。

## 千问配置

在后端 `.env` 填入 `QWEN_API_KEY`、`QWEN_BASE_URL`、`QWEN_MODEL`，重启 API。BASE_URL 为所选千问服务的 OpenAI-compatible API 根地址，程序追加 `/chat/completions`；模型需支持 JSON 输出。不要把密钥放到 `VITE_*`、前端源码或提交记录。

本次环境未配置这些值，已验证无 key、HTTP 错误、非法 JSON、假来源和模拟超时回退；HTTP 协议成功用本地 mock 验证，**尚未完成真实千问成功调用**。配置后可执行 `pnpm test:qwen`，该显式烟测只发送虚构内容、不读学生库；然后在实际跟进详情验证建议。页面会明确显示 Qwen suggestion 或 Template，模板不冒充模型结果。

模型仅收到当前学生/科目的必要文本与授权来源 ID；屏蔽档案内已知标识和常见联系方式格式，但自由文本脱敏不是完备保证。模型没有写工具，草稿不会自动发送或保存成沟通。

## Docker Compose：开发与生产

两份配置独立运行，不叠加合并；`compose.yaml`默认转到开发配置（需要Docker Compose 2.20+）。开发与生产使用不同项目名、网络和数据库卷。数据库使用官方`postgres:17-alpine`镜像，前后端由各自Dockerfile构建。

| 项目 | 开发：compose.dev.yaml | 生产：compose.prod.yaml |
| --- | --- | --- |
| 前端 | Vite，源码绑定挂载，HMR；127.0.0.1:5173 | 镜像内构建；Nginx提供静态文件，默认宿主机8080 |
| 后端 | TypeScript/Node watch；127.0.0.1:3100 | 镜像内构建，Node运行dist；无宿主机端口 |
| PostgreSQL | 127.0.0.1:5433，持久卷 | 无宿主机端口，独立内部网络及持久卷 |
| 浏览器请求 | Vite将`/api`转发到`api:3000` | Nginx将`/api`转发到`api:3000` |

共同启动顺序：**数据库健康 → 一次性migrate成功 → API健康 → web启动**。`migrate`退出0是正常状态，不是常驻第四个业务服务；迁移失败不会放行API。依据[Compose健康依赖配置](https://docs.docker.com/compose/how-tos/startup-order/)。

### 开发环境

```bash
cp .env.example .env  # 已有配置时跳过
# 不与本机 pnpm dev 同时占用5173/3100端口
docker compose -f compose.dev.yaml up -d --build
docker compose -f compose.dev.yaml exec api pnpm --filter @student/api db:seed
docker compose -f compose.dev.yaml logs -f api web
```

浏览器打开<http://127.0.0.1:5173>；API/Swagger为3100端口，数据库为5433。`.env`的`DEV_WEB_PORT/API_PORT/POSTGRES_PORT`可修改宿主机映射，容器内仍分别为5173/3000/5432。现有本地PostgreSQL卷保持不变。

绑定目录：`packages/web/src`、`packages/api/src`、`packages/common/src`及API的`prisma`；前端index.html和Vite配置也绑定。改页面会热更新，改API或common源码会重编译/重启；common在两个容器分别编译。依赖、dist及Prisma生成文件留在镜像/容器卷内，不共享macOS与Linux的node_modules，不覆盖本地构建产物。Docker挂载使用轮询监听以兼容Docker Desktop。

依赖清单、锁文件、tsconfig或Dockerfile变化后重新`up -d --build`；Prisma schema变化后先创建迁移文件，再执行`docker compose -f compose.dev.yaml run --rm migrate`和`docker compose -f compose.dev.yaml restart api`，重新生成客户端。源码热更新不会自动修改数据库结构。停止用`down`，保留数据库卷。

### 生产环境

```bash
cp .env.prod.example .env.prod
# 编辑.env.prod：填写独立数据库密码，按HTTPS入口配置SESSION_COOKIE_SECURE
# POSTGRES_PASSWORD建议使用随机字母数字/十六进制串，避免连接URL中的保留字符
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build
docker compose --env-file .env.prod -f compose.prod.yaml ps
```

前端镜像COPY源码后在构建阶段执行pnpm/Vite构建，最终由Nginx提供dist；后端镜像COPY源码并编译NestJS/common，最终运行构建产物。生产不挂载源码，不运行开发服务器，不自动导入演示seed。只web映射宿主机端口；api/db没有ports，数据库内部网络禁止外部路由，API另连应用网络以调用千问。Nginx支持SPA回退、`/api`代理和API容器替换后的DNS重新解析。

`.env.prod`独立于开发`.env`且被Git/Docker忽略，Qwen配置只传API；本例Nginx入口为HTTP 8080，可接已有HTTPS入口，届时保持`SESSION_COOKIE_SECURE=true`。仅本机HTTP验证时显式设`SESSION_COOKIE_SECURE=false`，`NODE_ENV`仍为production。可以用`WEB_BIND_ADDRESS=127.0.0.1`限制为本地入口；生产默认0.0.0.0。`.env.prod`不是镜像构建内容，密钥不写入镜像。

生产更新重新`up -d --build`，迁移在API启动前执行。`down`保留数据库；不要通过删除卷来修复迁移。旧双环境报告当前不在仓库，最终交付按[提交验收](.plan/12-submission.md)复核并记录。

## 验证命令

```bash
pnpm check              # Prisma + 前后端 TypeScript
pnpm test                   # 密码、DST、结构化输出及 Qwen HTTP 适配器
pnpm test:integration   # 实际 PostgreSQL：基础权限与完整业务闭环
pnpm build              # 前后端生产构建
pnpm openapi:generate   # Nest 导出 OpenAPI，再生成前端类型
pnpm audit
node scripts/check-compose.mjs  # Compose挂载/端口/启动依赖
# 可选：仅在后端配置千问后运行
pnpm test:qwen
```

基础集成测试使用端口 3101；工作流测试随机端口、独立 UUID 数据并只清理自身记录，Clock 仅测试进程注入。GitHub Actions 已接入这些检查；未在远端实际运行。API 的 dist-dev 和生产 dist 分开，构建不干扰开发服务。

OpenAPI 是前后端契约，写接口携带 UUID `Idempotency-Key`，变更携带 `expectedVersion`；生成文件随源码同步。当前规模使用 PostgreSQL 事务级 advisory lock 串行化短业务写，Serializable 冲突有限重试；LLM 在事务外，不阻塞预约。

## 文档与代码

- [AGENTS.md](AGENTS.md)：项目目的、业务约定与AI开发指引。
- [DESIGN.md](DESIGN.md)：业务取舍、当前切片边界、模型、规则、操作路径及草图；[实现细则](.plan/11-implementation-details.md)保存后续权益版本的详细契约。
- `packages/api/src/workflow`：读取权限、学生、排课预约、反馈、待办与 AI；`src/common`：Clock、事务幂等工具。
- `packages/web/src/pages`：学生、课表、个人待办；`components`：课次操作和表单；API类型由共享包提供。
- `packages/api/prisma`：增量迁移与兼容 seed；`packages/api/test`：单元、HTTP 和 PostgreSQL 验证。
- 文档页数和PDF留到最终交付整理；已有旧PDF不代表当前设计，也不作为本次页数验证依据。
- 历史扩展方案已从工作区移除，需追溯时查看Git历史；不作为当前执行清单。

## AI 工具与交付说明

使用 Codex 分析需求、整理计划、编写前后端、运行测试和浏览器验证；未采纳独立家长管理、菜单配置平台、完整收费/退款系统等扩张建议，因为本切片重点是试听后的可追踪跟进。没有输出未经验证的成交概率。开发者仍需理解并能解释设计和代码，尤其是权限、写锁、幂等与试听资格。

原题要求保留 Git 历史、不 squash；公共仓库、开始邮件、10 小时时窗、面试前至少 1 小时交付需要实际安排。本次没有创建公共仓库、发送邮件或宣称已完成外部提交，也没有改写已有 Git 历史。

### 权益后端隔离验证

```bash
pnpm test:entitlements
```

需要本机Docker可用。脚本自动创建临时PostgreSQL 17容器，运行迁移、权益API/事务与旧流程回归，结束清理本次容器；不会使用`.env`中的业务数据库。它验证本阶段后端，不代替预约扣减、前端和旧数据迁移的最终验收。

### 学生与课时页面隔离预览

```bash
pnpm preview:entitlements
```

启动临时PostgreSQL容器、API（3102）和Vite（18081），数据只在本次隔离库中；Ctrl+C清理本次预览容器及子进程，不使用或修改业务库。前端地址[http://localhost:18081/students](http://localhost:18081/students)，使用localhost避免与127.0.0.1旧环境共享登录Cookie。端口可用`PREVIEW_API_PORT`/`PREVIEW_WEB_PORT`覆盖。

仅供本地虚构数据验收：`admin@preview.test`、`teacher@preview.test`、`other@preview.test`，密码均为`Preview2026!`。包含三种学生类型、零余额、预约占用及预设套餐。可演示新增学生、赠课、追加试听、自定义/套餐正式购课、历史流水、Teacher权限；不代表新版预约扣减已完成，也不是01f正式演示seed。

隔离预览现在先执行一次虚构数据初始化，再使用Node watch运行API；后端重新构建会重启API并保留该预览库的资料。新增数据库字段仍需先对对应隔离库应用迁移，watch不会自动迁移或重跑seed。

学生身份按Student.type（TRIAL/MEMBER）保存：默认试听生，首次正式卡发放转会员。所有课次都是正常课程，预约kind仅是所用课时卡。迁移202609170007_student_type已在隔离预览库应用。

04b已完成：取消单个未来预约仅释放占用、不新增余额流水；试听生生成负责人REBOOKING待办，会员不因用试听卡取消而生成试听生待办。同一预约再次取消按参与版本识别新事件，保留原任务与沟通历史。04e恢复已完成重新校验课时/容量/冲突及本来源精确关单。04c同科目换课已完成：保留原卡、仅转移原占用、可恢复目标取消行；失败整体回滚。只处理明确来源待办，连续换课保持重约关联，换出/换入均有审计记录。见[换课验收](docs/BOOKING-MOVE-MILESTONE.md)。

04d查询已接入：名单和教学记录返回membershipCategory（TRIAL_STUDENT/NEW_MEMBER/MEMBER）及兼容category；按课次当地日期计算，会员使用试听卡或查看购课前记录也不降为试听生。课表人数使用相同规则，Teacher只看本人教学记录，其他Admin的个体反馈保持隐藏。接口与common生成类型已同步，见[名单查询验收](docs/ROSTER-READ-MILESTONE.md)。

05a前端预约交互已完成：选人同时显示两卡可用/占用、余额不足预选卡补录并返回原课次；缺联系人独立提示；恢复重验可用、换课转移原占用。重约支持student/sourceRebookingTaskId深链接，成功后清理来源；409保留原因和目标。Chrome隔离预览已验证，见[预约界面验收](docs/BOOKING-UI-MILESTONE.md)。跟进页重约入口和课后扣课仍按07d/06a推进。

2026-09-17课表预览补充：当前使用的[18083课程表](http://localhost:18083/timetable)已同步008/009迁移，新增本周60节虚构课程（原有1节保留），覆盖12班、4老师、3科目及60名示例学生。`pnpm preview:entitlements`现在自动初始化这套周课表；脚本`packages/api/test/seed-preview-timetable.mjs`只允许明确的本地`entitlement_ui_preview`库，同周重复运行不复制课程或覆盖编辑。它只演示课表和名单，新版签到/跟进闭环仍待后续开发。
