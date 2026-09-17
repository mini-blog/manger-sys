# 23 · 系统管理 / 菜单管理及导航接入

P1，待做；前置21、22。AdminRoute /system/menus，pages/Menus.tsx；改Layout使用GET /navigation，新增本地受控routeRegistry匹配key→组件和path。

表格按固定分组显示名称、固定路由（只读）、排序数字、Admin可见、Teacher可见；禁用项清楚说明“此角色无权限”或“核心入口不能隐藏”。可编辑显示名及排序即可，不做拖拽树/自定义路由/新增任意菜单功能。

加载用骨架；导航读取失败保留安全固定入口并显示可重试提示，不能把API失败当作空权限导致登出。保存携带聚合expectedVersion；冲突要求重新加载不覆盖；成功失效当前navigation/system菜单缓存。未上线key在前端同样拒绝渲染，路由有AdminRoute，API仍做鉴权。

验收：改名/排序刷新持久化；Teacher仅两个入口，伪造导航数据仍不能进Admin页；并发修改409；不能隐藏账号和菜单入口；没有任意HTML或图标字符串注入。
