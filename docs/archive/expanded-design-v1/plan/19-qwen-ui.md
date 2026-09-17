# 19 · AI 依据和话术审核界面

P0，待做；前置18。学生详情/FollowUpDialog嵌入AiDraftPanel.tsx，只有负责人可用。

用户选关联家长、语言和实际计划渠道，点Generate draft。展示摘要、意向信号（信息不足也是正常结果）、引用记录时间和内容、顾虑、下一步建议；点击证据定位当前学生时间线对应ID。EMAIL显示可编辑主题/正文，SMS/WECHAT显示短文案，PHONE/IN_PERSON显示提纲。

source=template明确显示Template fallback，不能写“千问分析完成”；超时不阻塞人工表单。生成按钮pending禁用，请求绑定studentId/contactId/channel/language；切学生或渠道时取消旧请求并清除旧草稿，防晚返回覆盖新页面。

提供Copy，不提供Send；复制成功只是草稿复制。只有另外提交Save communication才追加真实联系记录，不能把生成/复制当已沟通。AI文本用普通文本控件渲染，不执行HTML；不展示未校验概率、承诺优惠或价格。

验收：真实调用/模板均可编辑；无证据清楚显示信息不足；切联系人旧结果不串；Teacher不能打开；复制不改变待办count、status、version。
