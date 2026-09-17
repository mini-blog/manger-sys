# 02c · 学生分类查询API

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[02a](02a-membership-date.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第2、6、7节。无需通读其他任务正文。

## 唯一目标

只给现有学生查询增加服务端类别、计数与刷新时点。

## 修改入口

packages/api/src/workflow/read.service.ts、dto.ts、controller.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

GET /api/students保留mine/q/page/pageSize，新增category可省略；返回items/total/page/pageSize/categoryCounts/membershipAsOfDate/nextCategoryChangeAt。详情返回类别，firstPurchasedAt只给负责人。

## 实现边界

先scope+mine+q，再基于同一Clock时间分类/计数/分页，数据库同快照；计数不受当前category过滤，三类和=搜索权限总数，total是当前类数量。mine=true保留课表选本人学生兼容。Teacher scope沿用有效授课关系，不能返回精确购课时间/联系人/余额。逐步停用firstEnrolledOn公开字段由09c协调，过渡字段不能用作新分类。

## 不在本任务中

不实现课次标签、建档或前端。

## 完成检查

三Tab分区/分页/搜索/mine、午夜同快照、他人详情脱敏、Teacher授课范围；pnpm openapi:generate。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
