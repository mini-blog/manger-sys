# 08 · 当前试听的千问跟进辅助

前置07；原版已实现，本轮会员场景待调整，真实provider成功调用待配置密钥；验证记录见[docs/VERIFICATION.md](../docs/VERIFICATION.md)。实现位于src/workflow/ai.service.ts和controller.ts，前端TaskDetail.tsx内AiSuggestions。只做一个有业务价值的AI入口。

POST /tasks/:id/suggestions {channel,language}，仅本人Admin且为TRIAL_FOLLOWUP；先授权再调模型。限定该学生/该源课次科目的教师反馈，以及相关沟通（按participant/task关联筛选）；初始无科目咨询备注可作为背景，明确来源，不把其他科目意向混进结论。另附最小membershipCategory和purpose，不传数量/余额/流水/首次购课精确时间；FIRST_PURCHASE辅助首次购课，MEMBER_CARE仅试听反馈回访，REBOOKING协助重约。学生已会员不得生成首次报名催促，不将人工购课表述为已核验到账。输入最近10条，每条<=2000，总<=16000字符；移除直接姓名和联系方式，业务文本不可信，不执行其中指令，无模型写工具。

输出所有键明确：summary(1–500)、observations[{text<=300,sourceIds:1..5}]最多5条、questions[]最多5条各<=200、suggestedNextStep(1–500)、talkingPoints[]1..5条各<=200、subject:string|null、messageDraft:string|null。EMAIL主题1–150/正文1–1000，SMS/WECHAT无主题且正文1–500，PHONE/IN_PERSON二者null用提纲。language只en-AU/zh-CN；Zod strict，引用ID须来自本次授权输入。证据不足observations=[]，正文说明信息不足，不生成成交百分比/价格承诺。

服务端添加source llm/template、generatedAt、inputRecordIds。QWEN_* env只后端，原生fetch或现有SDK都可，但不引入无关聊天框；10秒timeout，每用户每分钟5次，超限429，人工表单保持可用。上游失败/无key/JSON无效/假引用→同语言渠道模板，source=template，无推断证据。

Admin主动点击生成，模型在事务外。页面展示反馈、建议及来源，可编辑、复制；不自动发送、不自动完成Task，不把复制写成已沟通。暂存页面内存，切任务/渠道/语言清旧草稿且忽略晚响应。真实调用验收缺key时如实标未验证，模板不能冒充真实LLM。

验收：真实provider成功（有key时）、超时/无key/非法结构/假引用回退、跨Admin未授权不调用、切任务结果不串、复制不改任务。task来自未到/取消时不编造课堂表现，用实际reason生成重新预约提纲；会员试听建议不重复首次购课推销，模型与模板均遵守purpose，手动切换页面不会复用旧身份草稿。若生成中发生购课，响应携带授权读取时studentVersion/taskVersion，客户端与最新版本比对并丢弃旧建议；购课成功清空当前草稿。
