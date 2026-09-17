# 24 · 系统管理 / 操作记录

P1，待做；前置02。src/audit/*、pages/AuditLogs.tsx，AdminRoute /system/audit。

GET /audit-logs?page&pageSize&actorId&action&from&to，时间区间最多90天，稳定createdAt DESC,id DESC。仅Admin，只返回actor基本姓名、action、entityType/id、requestId、时间、白名单变更摘要；不能透过审计查看无权家长联系方式或销售原文。详情最多字段级非敏感前后值；原始错误栈不进表。

列表筛操作者/动作/墨尔本日期，点击展开摘要，相关链接仍需实体接口权限，不从audit绕过。没有新增、编辑、删除按钮和对应API；真实业务事务写审计，不由前端补日志。

验收：改课/建档/停用/菜单更新均有一条成功审计；业务失败回滚不出现成功日志；Teacher403；按日期边界正确；数据中搜不到password、csrfToken、Cookie、QwenKey、完整家长联系信息。
