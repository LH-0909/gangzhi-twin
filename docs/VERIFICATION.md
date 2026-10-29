# 本地核查记录

日期：2026-10-28。环境：Windows、Node.js 24、Python 3.12。本记录区分源码/接口验证与实际浏览器视觉验证。

## 已执行

- `scripts/start.ps1` 与 `scripts/stop.ps1` 的 PowerShell AST 解析均为 0 个语法错误。
- 通过 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -SkipInstall -NoBrowser` 启动前后端。
- 再次运行相同命令，确认复用本项目原有前后端 PID，没有新增重复服务。
- 通过 `scripts/stop.ps1` 结束清单记录的本项目进程，确认 5180 与 8011 释放；随后重新启动成功。
- 确认 8001 原有其他项目进程仍在运行，未对其执行结束操作。本项目选择 8011 以避免端口冲突。
- `http://127.0.0.1:5180/` 返回 HTTP 200，HTML 语言为 `zh-CN`。
- `http://127.0.0.1:8011/api/health` 与经前端代理的 `http://127.0.0.1:5180/api/health` 均返回 HTTP 200，`service` 为 `gangzhi-twin`，`data_mode` 为 `simulation`。
- 经前端代理访问 `/api/state` 返回 HTTP 200；当前初始场景返回 8 艘船舶、14 项设备和 8 项任务。
- `http://127.0.0.1:8011/docs` 返回 HTTP 200。
- 后端开发验证命令 `.venv\Scripts\python.exe -m pytest -q` 由后端开发流程执行，追加数据口径和多场景审计后结果为 **27 passed**。测试覆盖不同随机种子与五类情境；保留可能为负的工期优化率。

## 验证边界

上述 HTTP、接口、生命周期和后端测试均实际执行。浏览器自动控制在当前环境因无法可靠确认浏览器 URL 而被工具停止，因此本记录不宣称已完成三维画面的视觉验收、全页面点击测试或持续运行性能测试。

首次完整依赖安装与离线重新安装不属于本次 `-SkipInstall` 生命周期核查。运行日志保存在本地 `.runtime/`，未纳入 Git。
