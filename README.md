# StudentSys

面向澳洲教培机构 Admin / Teacher 的学生管理系统。核心业务目标是通过课表安排试听，再用课堂反馈、沟通记录和 AI 建议完成家长跟进。

**当前交付是可运行的基础工程，不是完整面试作业。** 业务方案见 [DESIGN.md](./DESIGN.md)，实现约定见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。

## 已实现 / 待实现

| 已实现 | 后续目标，尚未实现 |
| --- | --- |
| React + MUI 页面、React Query 请求与缓存 | 咨询建档、联系人与时间偏好录入 |
| NestJS API、Prisma 模型及真实 PostgreSQL 迁移 | 试听预约、取消、冲突与容量事务 |
| 工作邮箱密码登录、Cookie 会话、CSRF、退出失效 | 单次课次调整及审计 |
| Admin 全周课表、Teacher 仅看自己的课次和名单 | 到课与个体反馈、试听权益 1→0 |
| 七天课表、科目／班级／老师筛选、周切换 | 自动跟进待办、沟通记录 |
| 试听学生置顶、新生标识、loading / 空 / 错误状态 | 千问意向分析、证据引用、话术与降级 |
| Swagger、OpenAPI 导出及前端生成类型 | 课时包与购买订单仅设计，不在本次切片目标内 |

前端从真实 API 读取数据库，不用静态数据冒充业务完成。Seed 中的 TRIAL 仅表示名单来源，当前还没有预约写操作或试听扣次。`QWEN_*` 只是预留配置，当前不会调用模型。

## 本地开发

需要 Node.js 22.17（`.nvmrc`）、npm 10+ 和已启动的 Docker。

```bash
cp .env.example .env
npm ci
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run openapi:generate
npm run dev
```

- 前端：<http://127.0.0.1:5173>
- API：<http://127.0.0.1:3100/api/health>
- Swagger：<http://127.0.0.1:3100/api/docs>
- OpenAPI：<http://127.0.0.1:3100/api/openapi.json>
- PostgreSQL：本地 `5433`，连接串见 `.env`。

API 开发端口由 `.env` 的 `API_PORT` 设置，Vite 代理读取同一配置；更改后重启开发服务器。端口 3000 在当前电脑已有其他服务，默认改用 3100。

## 演示账号与数据

首次 seed 的密码来自 `.env` 的 `SEED_PASSWORD`，示例值为 `DemoPass2026!`，只供本机虚构数据演示。

| 角色 | 账号 |
| --- | --- |
| Admin | `alice@example.com` / `oliver@example.com` / `grace@example.com` |
| Teacher | `emma@example.com` / `james@example.com` / `sophie@example.com` / `noah@example.com` |

生成 3 位 Admin、4 位 Teacher、60 名虚构学生、12 个班级、3 门科目和墨尔本当前周的 60 节课（周一至周日）。重复执行保留已有记录和密码，补充缺失数据；跨周执行会新增当周课次。课程和科目在课次层关联，同班可以教授不同科目。

使用 Admin 查看全周课表，选择带 Trial 标签的课次打开名单；退出后用 Teacher 登录，对比课次范围。前端只展示获授权的数据，后端也会拒绝访问其他老师的名单。

## Docker Compose 完整运行

```bash
cp .env.example .env # 已有 .env 时跳过，不覆盖自己的配置
docker compose up -d --build
docker compose run --rm migrate npm run db:seed -w @student/api
docker compose ps
```

访问 <http://127.0.0.1:8080>；Swagger 在 <http://127.0.0.1:8080/api/docs>。数据库健康 → 执行迁移 → API 健康 → 启动 web；seed 手动执行，不随启动重置数据。

Compose 是本机 HTTP 演示配置：端口仅绑定回环地址，Cookie 未开启 Secure。公共部署需要 HTTPS、生产模式、Secure Cookie、独立数据库及非演示凭据；目前没有公开部署链接。数据库卷在 `docker compose down` 后保留。

本次本机数据库容器已运行；完整镜像构建曾遇到 Docker Hub 基础镜像拉取超时。若再次遇到，先确认 Docker 的网络／代理能拉取 `node:22.17-bookworm-slim` 和 `nginx:1.28-alpine`，再重试，不要改用不满足版本要求的 Node 镜像。

## 检查与验证

```bash
npm run check              # Prisma 校验与前后端 TypeScript
npm run test               # 密码校验与墨尔本夏令时周边界
npm run test:integration   # 先启动数据库并 seed；临时使用 3101 端口
npm run build             # 前后端生产构建
npm run openapi:generate   # 从 NestJS 导出契约并生成前端类型
npm audit
```

集成测试针对本地虚构演示库，验证健康检查、登录、60课次覆盖七天、试听名单置顶、教师对象权限、未知输入拒绝、CSRF 和服务端退出失效。它不会测试尚未实现的预约、扣次或 AI 功能，也不能据此宣称 Part B 已完成。

GitHub Actions 已配置 PostgreSQL 服务、构建、测试及契约同步检查，尚未在远端运行。开发编译使用独立的 dist-dev，避免生产 build 干扰运行中的开发服务器。

OpenAPI 文件提交到仓库；修改 DTO 后运行生成命令并提交 `openapi.json` 和 `apps/web/src/api/schema.d.ts`。生成的 Prisma Client 不提交，通过 `db:generate` 或 API build 生成。

## 目录

```text
apps/api/
  prisma/             # schema、迁移、幂等 seed
  src/auth/           # 密码、会话、权限 Guard
  src/schedule/       # 课表、名单、墨尔本周边界
  src/bootstrap.ts    # 运行时输入校验与 Swagger
  test/               # 单元与 PostgreSQL 集成验证
apps/web/src/
  api/                # OpenAPI 生成类型及请求客户端
  auth.tsx            # 会话与路由保护
  pages/              # 登录、概览、周课表
  components/         # 布局、指标、名单侧栏
  hooks/              # 带用户维度的课表查询
  App.tsx             # 路由
compose.yaml          # web / api / migrate / db
```

## AI 工具使用与取舍

使用 Codex 梳理需求、整理设计、生成基础代码并执行检查；业务判断来自讨论，后续需要本人逐项理解和确认。没有采纳“第一版就完成收费、退款、自动排课”的扩张方案；AI 意向分析采用有记录依据的建议，不输出未经验证的成交概率。为避免用假数据冒充后端，页面直接使用已迁移、seed 的 PostgreSQL 数据。

使用 Prisma 7.10.0 稳定版，未采用需要更新 Node 的 Prisma 8 RC；通过 npm overrides 升级其 deepmerge-ts / mysql2 间接依赖并运行校验。正式作业须保留提交历史、不 squash。当前仅初始化本地 Git，尚未创建公共仓库、发送邮件或完成部署。
