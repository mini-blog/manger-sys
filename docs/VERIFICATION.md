# 本地验收记录 · 2026-09-17

本次实现范围为 plan/01–08 的试听与跟进切片。数据库为真实 PostgreSQL 17；自动化使用独立测试 ID，未清空开发库。以下是实际执行结果，不代表已向面试方提交。

## 自动化

| 检查 | 结果与覆盖 |
| --- | --- |
| `npm run check` | Prisma schema 与前后端 TypeScript 通过 |
| `npm test` | 4 项通过：密码哈希、Melbourne DST 周、结构化输出/来源/渠道校验、千问 HTTP 适配器（本地 mock） |
| `npm run test:integration` | 基础 HTTP 验证通过：真实 DB、登录/退出、CSRF、未知字段、学生搜索建档、全周课表、Teacher 课次与学生范围 |
| `node apps/api/test/workflow.mjs` | 11 组真实 PG 业务验证通过，Clock 在测试进程注入，无 HTTP 时间后门 |
| `npm run build` | Nest 与 Vite 生产构建通过；Vite 提示 vendor 包约 533 KB，后续可按路由拆包 |
| `npm run openapi:generate` | 已生成当前接口与前端类型；POST 响应为实际 201，幂等 header 只有一处定义 |
| `npm audit` | 0 个已知漏洞 |
| `git diff --check` | 无空白错误 |

工作流 11 组验证包含：

1. 同键同输入返回原结果，不同输入 409，不重复预约。
2. 学生归属、Teacher 和跨 Admin 的字段/对象权限。
3. 并发抢最后一席只一方成功；换课目标满员保留来源席位。
4. 课前不可反馈；完整名单与个人反馈验证；失败回滚已更新的前序学生；并发相同结果提交只生成一套任务；任务只对各自 Admin 可见。
5. AI 越权不调用 provider、合法 mock 结果、假来源与模拟超时回退。
6. 考虑中继续跟进、报名日期首次设置、关闭幂等、关闭后独立沟通。
7. 取消/恢复复用来源任务、同科目换课、替课移交老师任务、未到释放试听资格。
8. 教师/班级/学生重叠冲突、正式入学日规则、Teacher 筛选无法扩大范围、null 输入拒绝。
9. 影响名单确认、取消课次关闭老师任务并产生重约、取消课次不可恢复单人预约、显式重开跟进。
10. AI 每用户每分钟 5 次限制，不影响人工跟进。
11. 新生第 6/7 天边界、DST 的 nextDay17、不存在/重复当地时间拒绝。

## 浏览器实际操作

在本机 Chrome 测试页面完成以下操作，使用虚构演示资料：

- Alice 新建 `Workflow UI Demo`，填写家长信息；非法邮箱显示服务端错误且保留输入，修正后保存。
- 从学生详情进入课表，预选该学生，预约未来试听；人数及试听标签更新，重复预约按钮受资格约束禁用。
- 取消该预约后，Alice 首页出现对应个人跟进；生成建议显示明确的 Template 回退标记。
- 记录实际沟通、选择暂不考虑及关闭原因；任务 DONE，历史记录持久化。
- Emma 登录，打开历史待反馈样例，标记到课并填写个人反馈/能力记录；提交后只读且任务 DONE。
- 切回 Alice，看到该试听的新跟进待办。Teacher 页面不含家长信息和 Admin 业务按钮。
- 查看空学生课次/沟通列表、加载状态、错误状态与窄窗口布局。临时 viewport 设置已恢复。

浏览器新建的 `Workflow UI Demo` 是本次虚构验证记录，保留为已关闭的跟进示例；没有更改真实学生数据。Seed 样例的提交结果不会被再次 seed 覆盖。

## Compose 与迁移

使用独立项目 `studentsys-verify`、卷 `studentsys-verify_postgres_data`、数据库端口 55433、Web 18080：

- 成功构建 migrate/api/web 镜像，空库执行全部迁移，包括 Task 来源部分唯一索引及 CHECK。
- db 与 api 健康，migrate 正常结束，web 代理正常。
- seed 成功；通过代理验证前端 200、health、Alice 登录、本人任务、AI 无 key 回退、退出。
- 原 `studentsys-db-1` 与其开发卷保留，开发 API 3100 / Web 5173 继续可用。

生产式构建预览在 http://127.0.0.1:18080；日常开发使用 http://127.0.0.1:5173。这两个环境的数据库彼此独立。

## 设计与实现取舍

- 实际模块集中在 `apps/api/src/workflow`，避免为八张业务表再建立八套 CRUD；前端反馈/跟进共用 TaskDetail，课表操作集中在 Roster 与 SessionEditor。
- 事务锁采用统一短写 advisory lock + Serializable 重试，替代计划中的多实体行锁顺序；已在 DESIGN/IMPLEMENTATION 同步原因。当前规模优先减少锁协议复杂度，模型请求不占锁。
- 旧数据库 `isNewToClass` 列为升级兼容暂留；新接口、标签、反馈逻辑均不再使用，后续独立迁移可以删除。历史已提交标签使用 categorySnapshot。
- 设计正文已按 A4 导出为 3 页，逐页渲染检查无溢出/遮挡；文件 `output/pdf/DESIGN.pdf`，草图单独保留在 DESIGN.md 附录。

## 尚未验证的外部条件

- 当前后端未配置 QWEN_API_KEY / BASE_URL / MODEL，真实千问成功调用未运行。HTTP 适配器 mock 与回退不能替代这一项。配置后运行 `npm run test:qwen`（只发送虚构输入），并在任务详情检查真实建议。
- 远端 CI、公共部署、公共仓库、发送邮件和面试交付时窗未实际执行。
- 集成运行有 Prisma/pg 驱动的并发查询弃用提示；当前 pg 8 测试通过，升级 pg 9 前需复查适配器兼容性。
