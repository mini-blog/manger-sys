# 10h · 课时管理列表与只读流水页

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[10g](10g-entitlement-read-api.md)、[10j](10j-ledger-read-api.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第7节。无需通读其他任务正文。

## 唯一目标

只增加Admin课时路由、列表和流水查看。

## 修改入口

新增packages/web/src/pages/Entitlements.tsx；packages/web/src/App.tsx、components/Layout.tsx。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

路由/entitlements支持studentId/q/page；列表本人学生两池remaining/reserved/available与类别，按bucket分页看流水。

## 实现边界

Teacher隐藏菜单且直达路由拒绝；后端仍是最终权限边界。无流水零余额仍显示学生，套餐历史读快照；列初始赠送/追加试听/自定义购课/套餐购课/消费/期初，不提供删除或改余额。预留新增按钮仅在10i接通后启用，不做假的成功动作。

## 不在本任务中

不实现发放表单、不更改useWrite全局行为。

## 完成检查

Admin搜索分页/空/加载/错误，Teacher直达、他人studentId、只读流水和套餐快照。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
