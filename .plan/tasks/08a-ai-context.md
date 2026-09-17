# 08a · AI按会员身份生成建议

- 类型：开发；范围：后续权益版本；状态：待执行（本轮仅修订计划）。
- 前置任务：[07c](07c-task-read.md)、[07b](07b-followup-command.md)。
- 最小阅读：[共同约定](../00-contracts.md)、本文；按需查看[实现细则](../11-implementation-details.md)的11第5节。无需通读其他任务正文。

## 唯一目标

只修正建议输入/模板和响应快照，让会员不被首次推销。

## 修改入口

packages/api/src/workflow/ai.service.ts、dto.ts；packages/api/test/ai.test.ts。路径以仓库根目录为基准；标注“新增”的文件尚不存在。沿用现有服务，不为本任务重搭模块。

## 输入与交付契约

请求仍{channel,language}；成功及模板响应都附studentVersion/taskVersion，字段来自调用前一致读取快照。

## 实现边界

仅本人Admin，明确type=TRIAL_FOLLOWUP。按任务purpose和当前membershipCategory选择有效意图：已会员即使查看旧FIRST_PURCHASE也只做回访；REBOOKING不编造课堂表现。事务内短读授权/版本/最多10条相关沟通及反馈，退出后才调用provider；总输入<=16000，每条<=2000，已知标识脱敏。不传首次时间/余额/数量。结构化输出字段、长度、引用校验及10秒超时/5次每分钟沿用，subject和messageDraft为必有键、可为null；模板遵守相同意图。

## 不在本任务中

不改UI、不自动发送、不把真实provider验收替换为mock。

## 完成检查

会员+旧销售任务、未到、取消、无证据；provider失败/假引用回退；版本对应输入而非调用结束时间，越权不调provider。

在本文件记录实际改动、检查命令/结果、未验证项，再更新总索引状态。新增API同步Swagger/OpenAPI及common生成类型；测试随本任务实现，不全部推迟到09。本任务完成不代表整版权益功能可上线，发布依赖见[09c](09c-cutover.md)。

## 执行记录

尚未执行；没有代码或测试通过声明。
