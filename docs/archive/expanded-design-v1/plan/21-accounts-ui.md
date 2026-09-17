# 21 · 系统管理 / 账号管理

P1，待做；前置20。AdminRoute /system/accounts，pages/Accounts.tsx。此模块上线时在左菜单增加System management / Accounts；不要提前放空页面。

列表姓名、工作邮箱、角色、状态；搜索和role/status筛选分页。新增Dialog字段姓名、账号邮箱、初始密码、角色；密码输入type=password，不生成包含明文密码的URL或日志。编辑姓名/角色，停用/启用和重置密码独立操作，确认文案标明会使该账号会话失效。

本人行禁止停用/降级；后端409仍展示真实依赖，如负责学生/未来课次，不能只用disabled掩盖原因。重置密码由Admin线下交付，本次不发邮件短信。成功后清空密码字段，取消也清空。

新加AdminRoute通用组件，Teacher直达/system/accounts显示无权限并可回自己课表。菜单可见性来源角色和固定注册表，不依据本地storage role。

验收：新增Teacher可用新账号登录但只见本人课程/学生；禁用后原浏览器会话失效；账号页面不显示密码/hash；键盘可提交表单；请求失败保留非密码输入并允许重输密码。
