# 22 · 菜单注册表和配置 API

P1，待做；前置02。src/menus/*，前后端共享稳定key但各自有安全上限。不要设计任意代码、组件名或任意URL的动态路由引擎。

## 数据和契约

固定registry：overview,followups,timetable,trials,parents,students,classes,courses,accounts,menus,audit；每项固定path、groupKey、allowedRoles、featureAvailable。未上线key不返回可启用菜单；教师只允许timetable/students，显示名称可按角色设My lessons/My students。

MenuSetting: key PK,labelAdmin?,labelTeacher?,order Int,visibleAdmin Bool,visibleTeacher Bool,version。分组固定 Workspace/Teaching/Resources/System；不能任意嵌套/更改路由；Teacher学生放Students组是角色投影。

GET /navigation 当前角色可见且已上线菜单，按group/order/key；GET /system/menus Admin全部已上线设置；PUT /system/menus {expectedVersion,items:[{key,labelAdmin?,labelTeacher?,order,visibleAdmin,visibleTeacher}]} 采用单一MenuConfigVersion行锁和版本，事务整体更新，生成审计。限制名称1–40、order0–999、不得重复key、不接受path/role/组件表达式。默认settings缺失则回固定安全配置。

SYSTEM四类（包括accounts、menus、audit）永不允许Teacher；同时固定allowedRoles是上限，配置不能扩权。Teacher的两个核心入口、Admin的accounts/menus入口不可隐藏，防管理入口消失。菜单隐藏只影响导航，不能撤销或授予API权限；若要禁用功能，应另做业务配置而不是靠菜单。

## 验收

Teacher不能GET/PUT系统配置，navigation只两项；伪造key/path/可见性扩权400；旧version409；部分非法项整个更新回滚；导航和后台硬权限一致；未上线功能不能通过配置变成可访问页面。
