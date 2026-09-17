# 10i · 新增课时弹窗与发放缓存

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[10h](10h-entitlements-ui.md)、[10f](10f-grant-command-api.md)、[10d](10d-package-read-api.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第5、7节。无需通读其他任务正文。

## 唯一目标

只实现统一发放表单与一次命令的可靠提交。

## 修改入口

新增packages/web/src/components/GrantCreditsDialog.tsx；packages/web/src/pages/Entitlements.tsx。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

三种互斥body来自OpenAPI；响应是完整GrantResponse，不是现有useWrite强转的{id}。使用局部typed mutation即可，避免顺带重构全部写hook。

## 实现边界

先选本人学生，默认TRIAL+节数；REGULAR可CUSTOM或PACKAGE，后者数量只读。来自URL studentId/bucket=REGULAR/mode=CUSTOM时预选；切换清无关字段，空套餐仍可自定义，套餐改版409刷新后重新确认。相同body网络不确定复用UUID，新body/成功后新操作用新键。成功刷新余额/流水/选人；正式额外刷新学生/任务并清过时AI草稿；不凭重放旧响应覆盖当前缓存，应refetch。返回位置仅允许本地已知路由。

## 不在本任务中

不做套餐维护、支付、优惠、余额直接编辑或全站mutation框架。

## 完成检查

不赠课学生追加试听、会员仍可试听、正式自定义/套餐、空套餐、版本冲突、双击/断网重试、输入保留与返回来源。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
