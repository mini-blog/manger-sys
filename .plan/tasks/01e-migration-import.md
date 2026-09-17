# 01e · 核对数据的幂等导入

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[01d](01d-migration-preflight.md)、[02a](02a-membership-date.md)、[07a](07a-followup-policy.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第1、6、8节。无需通读其他任务正文。

## 唯一目标

只把已核对的期初余额/首次购课与旧任务映射原子写入。

## 修改入口

新增packages/api/scripts/entitlements-import.ts；packages/api/package.json。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

输入01d核对JSON与原数据指纹，含批次/核对来源/操作者；支持dry-run和显式apply；有未核对项即拒绝整批。

## 实现边界

在已停止旧应用写入的维护环境重验指纹。MIGRATION=B+C，补历史ATTENDED唯一消费，保留R，Student首次日期只按凭证填。稳定sourceKey以学生/池/来源标识，不依赖随意新批次以免重复导入；已导入内容不同拒绝。Admin task回填purpose：取消/未到为REBOOKING，到课按核对身份分类；已完成原因与日志保留，不伪造购课关单。旧categorySnapshot不改，无法还原的会员快照null。小规模全批事务，失败无半批。

## 不在本任务中

不在用户真实库直接试跑、不做自动估算、不删除旧收据。

## 完成检查

同文件重跑/换批次不重复；指纹变动拒绝；零余额会员有证据且TRIAL无零行；任意错误全回滚；导入后remaining>=reserved>=0逐生可对账。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
