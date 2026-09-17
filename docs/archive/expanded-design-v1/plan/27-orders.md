# 27 · 二期：课时包、订单及收款发放

P2，待做；前置05、08、02。本任务可以再依package目录、订单、收款动作逐步提交，但每步禁止假“已付款”。

LessonPackage: id,courseId,name,units Int>0,priceMinor Int>=0,currency固定AUD,status,version。PurchaseOrder: id,studentId,payerContactId,packageId,snapshot（name/courseId/units/priceMinor/currency）,status PENDING/PAID/CANCELLED,confirmedBy?,confirmedAt?,createdBy,version。CreditAccount唯一(studentId,courseId)；CreditEntry: accountId,delta Int,reason PURCHASE/ATTENDANCE/REVERSAL,orderId?,sessionId?,reversesEntryId? unique,businessKey unique,createdBy,createdAt。余额从流水求和，禁止任意PATCH余额。

Admin管理 /packages 的GET/POST/PATCH/归档；POST /orders {studentId,payerContactId,packageId}负责人，家长关联当前学生；GET /orders限本人学生，金额整数澳分；POST /orders/:id/confirm-payment {expectedVersion,reference:1..100} +幂等键，人工实际收款确认。订单锁/账户锁事务内PENDING→PAID与唯一purchase:orderId流水+units；并发重试不多发。POST /orders/:id/cancel仅PENDING；PAID不能取消替代退款。

UI目录/订单独立页，仅Admin；Intl.NumberFormat en-AU currency AUD。展示100 units不写100小时；价格为用户录入，不预设实际售价。“有意购买”待办不能自动标成支付。现金退款/税务发票/兄弟共享/跨科目兑换本任务不做。

验收：旧订单快照不随商品涨价变；同付款人多孩子各自账户；Teacher403，其他顾问不能收款；同订单并发确认只一条流水；金额溢出及小数拒绝；归档商品不能新买、旧订单可查。
