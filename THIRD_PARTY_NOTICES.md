# 第三方来源与贡献记录

核查日期：2026-10-28。项目采用“保留上游历史、在独立分支开发”的方式，不能将上游全部代码宣称为原创。

| 来源 | 核查提交 | 许可证 | 本项目采用方式 |
| --- | --- | --- | --- |
| [alexngdev99/rork-seaport-logistics-3d](https://github.com/alexngdev99/rork-seaport-logistics-3d) | `cb0bb9f8be3cdfd7f22cbadf184100580ff13e30` | MIT，Copyright (c) 2026 Portwise contributors | 仓库历史、构建工具与 React/Three.js 工程基础；原始源码完整保存在 `upstream/portwise-original` 标签，当前分支清理未使用上游页面、组件、场景、资产和依赖 |
| [HUSNAIN-MUNAWAR/harborvision-twin](https://github.com/HUSNAIN-MUNAWAR/harborvision-twin) | `f9cd714f54e7e139735717315a349a59891a769e` | MIT，Copyright (c) 2026 Husnain Munawar | 参考 FastAPI、业务实体、持久化、事件和回放的分层设计；没有整体合并该仓库代码 |
| [egeakici/port-operations-lab](https://github.com/egeakici/port-operations-lab) | `7124fa94019fc7772b5ef0e6e6bd1487b485efd3` | MIT，Copyright (c) 2026 Yasin Ege AKICI | 参考离散事件仿真、资源约束、随机场景与公平基线实验思路；没有整体合并该仓库代码 |
| [diegobayerl/3D_rendering_of_Porto](https://github.com/diegobayerl/3D_rendering_of_Porto) | `3ea70f20822df753bcccb6e36ece5d5addca7c51` | 核查的仓库根目录未发现 LICENSE | 仅核查，不使用其代码、GLB 模型或其他资产 |

## 贡献边界

| 部分 | 上游基础 | 港智孪生新增 |
| --- | --- | --- |
| 工程基础 | Portwise 的 Vite、TypeScript、React、Three.js 工程基础及 Git 历史 | 精简依赖、独立中文产品入口、模块组织和本地联合启动 |
| 三维表达 | 上游程序化港口与 Three.js 渲染实现供设计研究，原场景在回滚标签保留 | 新的综合港场景组合、区域、图层、实体选择及海况联动 |
| 业务后端 | HarborVision 的领域分层理念参考 | 独立 FastAPI 接口、模拟状态管理、SQLite 持久化和告警确认 |
| 仿真调度 | Port Operations Lab 的资源约束和可重复实验理念参考 | 当前场景仿真、路径/扰动处理、基础与优化策略的指标对照 |
| 数据 | 上游数据主要围绕新加坡虚构航运场景 | 中文名称与教学模拟实体；大连相关场景语境，不宣称生产数据 |

MIT 完整正文保存在根目录 [LICENSE](LICENSE)，应随包含 Portwise 实质代码的分发一同提供。直接改写其文件时仍保留相关版权归属。各 npm 与 Python 依赖适用各自许可证，以锁文件及安装包的许可文件为准。

本项目没有获得大连港、辽宁港口集团或学校的官方数据授权或背书；名称和地区场景仅用于说明竞赛原型适用背景。真实港口、学校标识、商业模型与地图资产若后续加入，应独立记录来源与使用许可。
