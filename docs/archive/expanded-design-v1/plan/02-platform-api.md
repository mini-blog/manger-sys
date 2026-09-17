# 02 · 权限、错误响应与事务基础

P0，待实现；前置00。只交付跨模块基础，不借此重构整个项目。

## 文件 / 数据

新增 src/common/{permissions.service,clock.service,api-exception.filter,audit.service,idempotency.service,transaction}.ts；bootstrap.ts 注册过滤器；app.module.ts 注册提供者。Prisma 增加 AuditLog(id,actorId,action,entityType,entityId,requestId,metadata Json,createdAt)、IdempotencyRecord(id,userId,operation,key,requestHash,response Json,createdAt)，后者三字段组合唯一。metadata只收白名单字段，不能自由接收req.body。

## 行为

PermissionsService 提供 requireAdmin、requireStudentOwner、requireSessionTeacher、studentReadScope；所有模块共用。Clock.now 和 nextMelbourneDay17 可替换注入。错误统一00协议，requestId服务端UUID回传header；ValidationPipe的字段错误规范化。事务封装支持Serializable和有限重试，只重试明确数据库冲突，不重试外部副作用。

幂等服务必须和业务共用 tx，规范化请求JSON计算hash；唯一冲突后读取已成功响应。不得先写幂等成功、后写业务。删除旧幂等记录暂不自动化，后续再决定保留期。

## 验收

未登录401、教师Admin入口403、负责人不符403、非法DTO400有requestId且不泄露栈；Clock跨DST仍在次日当地17:00；并发同键仅一条记录；不同请求正文同键409；事务抛错业务和审计均回滚。保留已有auth/time测试。
