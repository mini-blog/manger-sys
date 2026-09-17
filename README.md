# StudentSys · 试听预约与课后跟进

面向 Admin 与 Teacher 的教培内部系统。已实现学生建档 → 课表预约试听 → 老师出勤/反馈 → 负责 Admin 的个人跟进待办 → 沟通记录与结果，使用真实 PostgreSQL。家长信息内嵌学生档案，课表是具体课次的查询视图。

## 本轮设计变更（待开发）

[DESIGN](DESIGN.md)与[plan](plan/README.md)已更新为：学生三Tab（试听学生/首次购课7日内的新会员/会员学生）、新增学生初始试听课时默认且最低1、独立权益管理手动登记购课、试听和正式双课时池。会员可继续使用试听，续购不重置首次日期，正式余额0不降级；套餐/优惠、支付退款不做。

**下面的功能和验收描述仍是当前代码的原版行为，不代表新设计已实现。** 本轮尚未修改业务代码、迁移数据库或执行新版验收；旧入学日、单科试听资格及手动报名结果将在计划实施时替换。

## 已实现（原版）

- 简洁账号/密码登录，左菜单「我的待办 / 课表 / 学生」。Cookie 会话、CSRF、服务端角色和对象权限。
- 学生档案、主要家长联系方式、学习目标/偏好、正式入学日、独立沟通记录。Admin 只编辑本人学生；Teacher 不接收联系方式或销售记录。
- 全班周课表与列表、关键词和班级/科目/老师筛选、单次排课、改时间/老师/容量、取消课次与变更记录。
- 试听/正式名单、取消、恢复、同科目原子换课；检查师生/班级冲突、容量与试听资格，幂等重试及版本冲突保护。
- 试听优先，新生按正式入学日起 7 个墨尔本日历日；历史反馈保存标签快照。
- 老师个人课后任务、完整名单出勤及逐人反馈；试听到课/未到分别产生负责 Admin 的任务。待办只属于本人。
- Admin 实际沟通、下次联系时间、关闭/重开、首次报名日期；关闭后仍可追加沟通记录。
- 千问结构化跟进辅助：来源引用校验、10 秒超时、限频、同语言/渠道模板回退；可编辑复制，不自动发送。

实际检查见 [验收记录](docs/VERIFICATION.md)，任务状态见 [plan](plan/README.md)。本次未做收费/退款/正式课时扣费、长期入班模板、家长端、账号/菜单管理和自动消息发送；人工“已报名”不代表系统已收款。

## 本地启动

需要 Node.js 22.17（`.nvmrc`）、npm 10+、Docker。

```bash
cp .env.example .env  # 已有配置时跳过，不覆盖
npm ci
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

前端 <http://127.0.0.1:5173>，API <http://127.0.0.1:3100/api/health>，Swagger <http://127.0.0.1:3100/api/docs>。开发数据库端口 5433；API 默认 3100，避免占用本机其他服务。更改 `.env` 端口后重启开发服务。

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

本次环境未配置这些值，已验证无 key、HTTP 错误、非法 JSON、假来源和模拟超时回退；HTTP 协议成功用本地 mock 验证，**尚未完成真实千问成功调用**。配置后可执行 `npm run test:qwen`，该显式烟测只发送虚构内容、不读学生库；然后在实际跟进详情验证建议。页面会明确显示 Qwen suggestion 或 Template，模板不冒充模型结果。

模型仅收到当前学生/科目的必要文本与授权来源 ID；屏蔽档案内已知标识和常见联系方式格式，但自由文本脱敏不是完备保证。模型没有写工具，草稿不会自动发送或保存成沟通。

## Docker Compose

```bash
docker compose up -d --build
docker compose run --rm migrate npm run db:seed -w @student/api
docker compose ps
```

访问 <http://127.0.0.1:8080>。数据库健康 → 迁移成功 → API 健康 → web 启动；seed 单独执行，数据库卷保留。已在独立 `studentsys-verify` 项目/数据库卷完成构建、迁移、seed、健康检查和代理访问，未重置开发数据。

Compose 为本机 HTTP 演示，只绑定回环地址。公开部署另需 HTTPS、Secure Cookie 和非演示凭据；目前没有公共部署。数据库不需要清空，也不要用 `down -v` 修复迁移。

## 验证命令

```bash
npm run check              # Prisma + 前后端 TypeScript
npm test                   # 密码、DST、结构化输出及 Qwen HTTP 适配器
npm run test:integration   # 实际 PostgreSQL：基础权限与完整业务闭环
npm run build              # 前后端生产构建
npm run openapi:generate   # Nest 导出 OpenAPI，再生成前端类型
npm audit
# 可选：仅在后端配置千问后运行
npm run test:qwen
```

基础集成测试使用端口 3101；工作流测试随机端口、独立 UUID 数据并只清理自身记录，Clock 仅测试进程注入。GitHub Actions 已接入这些检查；未在远端实际运行。API 的 dist-dev 和生产 dist 分开，构建不干扰开发服务。

OpenAPI 是前后端契约，写接口携带 UUID `Idempotency-Key`，变更携带 `expectedVersion`；生成文件随源码同步。当前规模使用 PostgreSQL 事务级 advisory lock 串行化短业务写，Serializable 冲突有限重试；LLM 在事务外，不阻塞预约。

## 文档与代码

- [DESIGN.md](DESIGN.md)：业务取舍、模型、规则、五个问题及草图；[IMPLEMENTATION.md](IMPLEMENTATION.md)：详细状态/事务约定。
- `apps/api/src/workflow`：读取权限、学生、排课预约、反馈、待办与 AI；`src/common`：Clock、事务幂等工具。
- `apps/web/src/pages`：学生、课表、个人待办；`components`：课次操作和表单；`api/schema.d.ts`：生成契约。
- `apps/api/prisma`：增量迁移与兼容 seed；`apps/api/test`：单元、HTTP 和 PostgreSQL 验证。
- `output/pdf/DESIGN.pdf`：原版正文 A4 导出，尚未包含本轮权益变更，不可作为新版交付稿；草图在 Markdown 附录；`scripts/export-design.py` 可重现导出（Python reportlab/pypdf，默认 macOS 宋体，可通过 DESIGN_FONT 覆盖同类 TTC 字体）。
- `docs/archive`：此前大范围设计的历史备份，不是待实施需求。

## AI 工具与交付说明

使用 Codex 分析需求、整理计划、编写前后端、运行测试和浏览器验证；未采纳独立家长管理、菜单配置平台、完整收费/退款系统等扩张建议，因为本切片重点是试听后的可追踪跟进。没有输出未经验证的成交概率。开发者仍需理解并能解释设计和代码，尤其是权限、写锁、幂等与试听资格。

原题要求保留 Git 历史、不 squash；公共仓库、开始邮件、10 小时时窗、面试前至少 1 小时交付需要实际安排。本次没有创建公共仓库、发送邮件或宣称已完成外部提交，也没有改写已有 Git 历史。
