# FiKA Fitness 开发规则

- **当前进度**: 已完成基础 HTML 架构，已部署到腾讯云 IP 42.193.115.77。
- **技术栈**:
  - 前端: React + Tailwind CSS
  - 后端: Node.js (Express)
  - 数据库: MongoDB
- **同步约定**:
  1. Claude 负责生成复杂 UI 和业务逻辑架构。
  2. Windsurf 负责本地调试、依赖安装和细微 Bug 修复。
  3. 所有的修改必须推送到 GitHub `main` 分支。
  4. 服务器通过 WebHook 自动拉取更新。
- **路径规范**: 前端代码在 /frontend，后端在 /backend。
