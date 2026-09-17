# 02e · 学生三Tab及日期刷新

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[02c](02c-student-read-api.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第6–7节。无需通读其他任务正文。

## 唯一目标

只替换列表分类和缓存行为。

## 修改入口

packages/web/src/pages/Students.tsx；必要时新增学生列表专用hook。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

URL category/q/page；请求显式category，显示categoryCounts；默认TRIAL_STUDENT。

## 实现边界

切Tab回第一页但保留搜索；非法URL类别归默认。按nextCategoryChangeAt设一次刷新定时器、恢复前台refetch，卸载清定时器；采用服务端分类，不客户端按余额猜测。Teacher三Tab仍只授课范围；计数不能使用当前页items.length。

## 不在本任务中

不改建档表单或课时发放。

## 完成检查

筛选分页保持、空类、授权计数、第6→7日/午夜及恢复前台；购课后列表失效能正确迁移类别。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
