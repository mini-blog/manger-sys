# @student/common

前后端共享的业务常量、字符串枚举类型与基础接口。没有运行时第三方依赖。

```ts
import { USER_ROLES, BUSINESS_TIMEZONE, type UserRole } from '@student/common';
import type { components, paths } from '@student/common/api';
```

- `src/index.ts`：角色、课次/出勤/待办状态、沟通渠道、语言、年级、时区和基础登录类型。
- `src/generated/api.d.ts`：从根目录OpenAPI生成的接口类型，不手动修改。执行根目录`pnpm openapi:generate`更新。
- `dist/index.js`：CommonJS，供NestJS使用；`dist/esm/index.js`：ESM，供Vite使用。由同一源码构建。

新增双方共同使用的定义放在这里；NestJS DTO装饰器、Prisma实体、React组件及仅服务端使用的逻辑分别留在所属包。不要让common反向依赖api或web。数据库枚举仍由Prisma schema定义，API契约测试验证它们与共享值一致。

根目录`pnpm build`按依赖顺序构建，`pnpm dev`同时监视三个包。单独调试消费者前执行`pnpm --filter @student/common build`。
