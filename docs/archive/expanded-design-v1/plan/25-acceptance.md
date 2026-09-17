# 25 · 种子、完整验收和交付

P0，待做；前置13、14、17、19。P1完成后将其越权测试补入，但不阻塞试听闭环提交。

## seed

扩apps/api/prisma/seed.ts，保留3Admin/4Teacher/60Student/12Class/3Course/当前周60Session七天数据。稳定ID补家长与兄弟姐妹关联、不同渠道和语言、Inquiry、TrialBooking、权益、FollowUp：未来待上、历史待补录、到课、未到、已取消、满员、同生冲突、逾期、有意但未付费。seed两次不重复、不覆盖人为编辑；示例only，无真实儿童数据。

## 测试拆分

apps/api/test/trials.integration.*、followups.integration.*、permissions.integration.*、ai.test.ts。真实PG独立测试记录，测试结束只按本次生成ID清理，不deleteMany全表，不要求开发库恰好60学生；当前integration对课次数可继续验证seed指定周。跨流程测试依赖注入Clock，推进一次新建课的时间，证明同一student/trial贯穿，不只拼接两个独立样例。

必须覆盖：

1. 登录→Admin建学生/家长/咨询→预约（剩余1可用0）→教师本人查看置顶试听→结束后个体反馈→权益0→Admin待办→AI真实/回退→人工沟通→改期/关闭。
2. Teacher未授权课次/学生/管理页直接API；Admin跨负责人联系人/沟通/AI；伪造owner；未知字段。
3. 两人抢最后席、同生重叠并发、相邻课无冲突、取消重约、消费后不可重约、过期待补录阻断；故障回滚。
4. 重复结果/沟通不重复扣或记、不同内容重试409、版本冲突、预约不会被并发调课绕过。
5. 墨尔本跨午夜和DST周167/169小时、缺失/双解本地输入、周日正常；次日17:00规则。
6. AI无key/超时/空响应/结构错误/伪造引用/不可信资料；实际provider成功另跑，不把unit mock当真实接入。

## UI / 交付

浏览器以Admin/Teacher各走流程，登录简洁，左菜单右内容、窄屏抽屉，loading/空/失败重试/输入保留/键盘可用。npm run check、test、test:integration、build、openapi:generate；契约重生成git diff无漂移。增加新脚本后CI调用，不能只把测试文件放着不运行。

docker compose在干净临时项目名/独立卷验证build→migrate→seed→访问，禁止down -v删用户当前卷。基础镜像网络阻塞如实报告，不宣称成功。README写实际启动/账号/范围/测试/AI使用；DESIGN导出统一A4检查正文<=3页，草图除外，详情放plan/IMPLEMENTATION。原题public仓库、邮件、10小时、面试前1h是交付要求；未经用户显式指令不向外发邮件，不在文档假称已完成。
