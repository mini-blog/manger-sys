# 00 · 所有任务的共同约定

状态：设计已定义。下面是执行合同；如果实现发现冲突，先修正相关文件并说明，不暗中改变业务。

## 角色和数据范围

| 能力 | ADMIN | TEACHER |
| --- | --- | --- |
| 管理页面可见性 | 所有已上线管理页 | 仅我的课次、我的学生 |
| 学生基础列表 | 全部；当前新建自动归自己 | 有自己未取消课次参与记录的学生（含历史） |
| 学生联系人、咨询、跟进、AI | 仅当前负责人 | 禁止 |
| 学生创建 / 编辑 | 新建自动负责；编辑仅负责人 | 禁止 |
| 课表 | 全部；调整共享未来课次须重验所有学生 | 只读自己的课次 |
| 教学反馈 | 负责学生的反馈详情；全局待补录只给摘要 | 仅自己课次的名单和个体教学反馈 |
| 老师结果提交 | 首版禁止代老师提交 | 必须是课次实际老师 |
| 资源目录、账号、菜单 | 管理 | 禁止；必要科目名等随授权课次返回 |

“Admin 所有页面”不是把不同顾问的家长联系方式全部开放。上述延续既有负责人规则，是当前明确的实现选择。若将来改为机构完全共享，需同步改权限矩阵和越权测试，不能只改菜单。

多孩子家长：Admin 只查关联自己学生的联系人，返回的孩子列表也裁剪；新增、关联已有本人可见联系人允许。共享联系人字段修改须所有关联孩子都由本人负责，否则 409 CONTACT_SHARED_LOCKED；首版不做跨顾问全局修改、合并、转交。Teacher 永不返回家长联系方式、销售备注、付款信息。

## 技术与接口

沿用 apps/api/src、apps/web/src 和当前锁文件。Nest 按领域 Controller / Service / dto 拆分；PrismaService 复用，禁止每个请求 new 客户端。扩展学生时把现有 students.ts 拆分而非创建重名路由。前端继续 MUI、React Query、openapi-fetch，不加第二套状态或 UI 库。

- API 都带 /api；Cookie + CSRF 保持现状。权限先检查，再访问业务数据；仅返回明确 DTO。
- 列表用 page（>=1，默认1）、pageSize（1–100，默认20）、q（<=80），返回 {items,total,page,pageSize}；稳定排序（业务字段、id）。课表的现有数组接口暂保留，不强行改分页。
- 未知字段拒绝，字符串 trim 并限制长度；所有日期运行时验证。400 VALIDATION_FAILED，401 UNAUTHENTICATED，403 FORBIDDEN，404 NOT_FOUND，409 细分业务冲突；响应 {code,message,requestId}，允许 validation details，禁止栈和 SQL。
- 幂等写操作支持 Idempotency-Key（UUID）；记录 userId、operation、key、requestHash、response，组合唯一。相同请求返回原结果，不同正文409；只缓存成功事务结果。重试先确认当前权限，再读取幂等结果。
- 可编辑聚合带 version Int default1；PATCH 携带 expectedVersion；条件更新不匹配409 VERSION_CONFLICT。追加历史不可覆盖。创建返回201；动作200；无内容用204，并写准确 Swagger 注解。
- 修改 DTO 后 npm run openapi:generate；前端必须使用生成类型。查询键含用户与筛选项；退出清缓存；写成功失效关联查询，失败保留表单。禁止用客户端筛选代替后端数据范围。
- 公共字段：createdAt/updatedAt 用 timestamptz；人员归属来自登录身份；新记录用 cuid，不使用姓名或联系方式作为主键。

## 时间、业务状态与并发

业务区 Australia/Melbourne，展示 en-AU、24小时；Date-only 单独处理。API 时间戳必须有 Z 或 offset；本地输入经 Luxon 验证 round-trip，并拒绝 DST 缺失和双解时间。以服务器 Clock 决定开始/结束和下一日17:00，测试注入 Clock，无改时 HTTP 接口。周一到周日均可排课；60课次不是上限。

所有涉及排课/名单的写事务统一 Serializable + 最多3次 P2034 重试，最终409 RETRY_CONFLICT。按 ID 升序：相关 Teacher User 行 → Student 行 → ClassSession 行 → 权益/账户行；单纯预约不需要锁 Teacher，但必须 Student → Session。变更前收集受影响 ID、事务内复查，集合变化则中止重试。所有写路径必须采用协议；读到空集也依靠 Serializable 防并发插入冲突。不得网络调用占用数据库事务。

时间冲突用 [start,end)：a.start < b.end && b.start < a.end；相邻允许。当前 SessionParticipant 唯一 (sessionId,studentId) 保留。为保留取消历史，增加 status ACTIVE/REMOVED；只有 ACTIVE 且课次 SCHEDULED 计人数／占时间。取消预约改 REMOVED，不删除历史；同次课不允许重新预约。同课程 NO_SHOW 后可约不同课次。

权益按 student+course 唯一；预约前剩余1/可用1，预约剩余1/可用0，到课后0/0；取消和未到释放。正式余额不得混入试听账户。一次到课反馈对应一个学生的待办，不是全班一个。

## 文件及验收

新增 migration 而不是改已执行 migration；先 backfill 再 NOT NULL；保留已有学生和 seed。引用实体不物理删除，归档后禁止新增引用，历史仍可查。操作审计与业务写入同事务，不记录密码、令牌、完整家长联系方式、AI全文。

每个任务完成：任务内验收 + npm run check + npm run build；接口变化再生成契约；涉及事务/权限时跑真实 PostgreSQL 测试。UI 至少检查正常、空、加载、失败重试、键盘、窄屏，禁止只凭编译宣称流程通过。README 与本目录标注实际状态。
