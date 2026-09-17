# 08 · 课程目录管理（科目）

P1，待做；前置02。Course不是某周几的具体一节课。src/courses/*、pages/Courses.tsx，AdminRoute /resources/courses。

Course沿用id/name唯一，增加description?（<=1000）、status ACTIVE/ARCHIVED、version。GET /courses分页q/status；POST {name:1–100,description?}；PATCH /courses/:id {name?,description?,expectedVersion}；POST /courses/:id/archive {expectedVersion}。全部Admin；教师仅从自己的课次响应获取科目名称。

重名409 COURSE_NAME_TAKEN；名称trim，保留现有唯一语义，不悄悄改大小写去重影响老数据。归档课程不能用于新咨询/新课次/试听/商品，既有历史仍读。存在未来有效课次、未处理试听或有效商品时409 ACTIVE_DEPENDENCIES，先人工处理。

页面表格名称、状态、编辑/归档；新增编辑Dialog，归档确认展示名称和影响；不物理删除。成功失效课程和用于表单的options。

验收：Teacher直接API403；同名冲突；更新过期version409；归档不能再选，历史课次仍正常；没有创建ClassGroup时也能独立创建Course。
