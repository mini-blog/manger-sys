# 18 · 千问分析和草稿 API

P0，待做；前置16。src/ai/{controller,service,provider,schemas,templates}.ts；Zod验证；QWEN_*配置只后端读取。

POST /students/:id/follow-up-draft {contactId,channel,language}：仅负责人。读取最近咨询/沟通/个人反馈各最多10条，每条限2000字符、总输入限16000字符；服务端分配可引用recordId，移除真实姓名、电话邮箱微信等直接标识，自由文本二次过滤。不读取其他孩子信息。用户文本只作为资料，不执行其中指令；provider不提供工具调用。

千问经其OpenAI兼容HTTP接口（不是我们的OpenAPI文档），可用原生fetch+AbortSignal，10秒deadline；核对所配地域和model的JSON输出能力，不硬编码未知模型名。请求和等待都在DB事务外。每用户每分钟最多5次；超限429且人工表单不受阻。

严格结构采用 ../IMPLEMENTATION.md 第4节全部字段和长度：summary、intentSignal、evidence[{recordId,reason}]、concerns、nextAction、talkingPoints、subject、messageDraft；EMAIL/SMS/WECHAT/PHONE/IN_PERSON的nullable规则原样执行。evidence的ID必须属于本次输入，无证据必须INSUFFICIENT；禁止虚构百分比。响应附可信source llm/template、channel/language、model?、generatedAt、inputRecordIds。

无key、超时、上游限流、空响应、非法JSON、额外字段、伪造ID一律返回同语言同渠道template且intentSignal INSUFFICIENT；错误日志只写requestId和原因码不写密钥/隐私原文。模板不是“分析成功”。不自动改学生意向、待办或发送消息；本版草稿只在页面内存，刷新丢失可再生成，不新增伪沟通记录。

验收：fake provider覆盖各种输出、越权前不调用provider、注入文本不改变schema、各渠道中英文模板；持有真实key时跑独立显式smoke且记录脱敏结果。没有真实成功调用必须标记LLM尚未实证，不用mock冒充作业完成。
