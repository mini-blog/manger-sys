# 20 · 员工账号管理 API

P1，待做；前置02。src/accounts/*；User增加status ACTIVE/DISABLED defaultACTIVE、version、createdAt/updatedAt；不添加公开注册。

GET /accounts?q&role&status 分页，仅id/name/email/role/status/version；POST {name:1..100,email,password:12..128,role ADMIN|TEACHER}；PATCH /accounts/:id {name?,role?,expectedVersion}（首版工作邮箱创建后不可改）；POST /accounts/:id/disable、enable {expectedVersion}；POST /accounts/:id/reset-password {newPassword:12..128,expectedVersion}。所有Admin，密码scrypt沿用，不回显hash/新密码。

账号状态及角色每次AuthGuard查库，不依赖前端旧会话；停用、重置密码、改角色事务内撤销全部AuthSession。停用账号不能登录，错误文案与密码错误一致；教师options排除禁用账号。

禁止停用自己/修改自己角色；最后一名ACTIVE ADMIN不能停用/降级。所有账号状态/角色变更以固定PostgreSQL advisory transaction lock串行检查活跃Admin数，不能各自count后并发锁死管理权。禁用/改角色若有负责学生（含未归档）或未来未取消课次则409 ACCOUNT_IN_USE，先转交/调课；历史关联保留，不删User。当前尚无转交功能时阻断并给明确原因，不偷偷转给操作者。

审计只写角色/状态差异和reset事件，不保存密码。账号重复email409；trim+小写标准化与login一致。

验收：Teacher各接口403；未知role400；返回无hash；停用旧cookie立即401；重置后旧密码失败；并发两个Admin降级不能留下0管理员；有未来课次账号不可停用；过期version409。
