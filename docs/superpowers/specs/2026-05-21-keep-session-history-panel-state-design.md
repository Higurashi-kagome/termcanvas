### 概述

本设计用于让左侧`会话`/`历史`面板记住用户最近一次的展开/收起状态,并在应用重启后恢复。

本次范围刻意收窄,只覆盖以下状态:

- `会话`页:

  - 项目展开/收起状态

  - 项目下 worktree / 分支展开/收起状态

- `历史`页:

  - 顶层项目组展开/收起状态

不在本次范围内的状态:

- `历史`页 worktree 分组展开/收起状态

- `历史`页会话树节点展开/收起状态

- `历史`页`show more`数量

- 已存在的`pin`/`hide`持久化语义

设计基线已同步到`main`当前实现:历史视图已经支持 worktree 显示与分组,但本次仍只记住顶层项目组状态,不记住历史页内部 worktree 分组状态。

### 目标

- 用户切换 tab、刷新数据、重开窗口、重启应用后,左侧面板尽量回到上次浏览层级

- 不在项目目录写任何文件,避免污染仓库和工作区

- 状态隔离粒度按项目路径处理

- 保持默认交互稳定,不因为后台新数据出现而突然展开整棵树

### 非目标

- 不提供跨项目路径迁移

- 不新增“重置全部面板状态”入口

- 不调整历史视图的 worktree 分组默认展开逻辑

- 不统一改造现有`pin`/`hide`存储结构

### 现状

当前左侧面板的折叠状态分散在不同位置:

- `会话`页项目树折叠依赖`sessionPanelCollapseStore`,仅保存在内存里的`Set<string>`

- `历史`页顶层项目组折叠依赖`HistorySection`组件内 state

- `历史`页其他细粒度状态如`expandedNodes`、`groupLimits`也是组件内 state

- `历史`页`pin`/`hide`已经通过`localStorage`做了本地持久化

这导致:

- 切换 tab 或重建组件后,部分状态会丢失

- 应用重启后,面板会回到默认展开层级

- `会话`页和`历史`页没有统一的持久化模型

### 约束

- 不在任何项目文件夹创建状态文件

- 状态只保存在应用自己的本地存储中

- 项目路径变更视为新项目,旧状态不自动迁移

- 现有`pin`/`hide`逻辑不纳入本次重构

### 方案选择

候选方案有三类:

1. 只给现有各处 state 零散补持久化

2. 新增一个统一的左侧面板 UI 状态 store,收口本次范围内的折叠状态

3. `会话`页用 store,`历史`页继续组件内 state,额外抽一个 persistence helper

最终选择方案 2。

原因:

- 本次需求已经跨越两个面板,且要跨应用重启,继续零散补丁会放大状态分裂

- 统一 store 更符合当前 Zustand 使用方式

- 后续如果要加“重置状态”“版本升级”“无效 key 清理”,集中模型更容易维护

### 状态模型

建议新增`src/stores/leftPanelUiStateStore.ts`,专门负责左侧面板展开/收起状态。

建议数据结构:

```ts
interface LeftPanelUiState {
  version: 1;
  sessions: {
    projectCollapsedByPath: Record<string, boolean>;
    worktreeCollapsedByPath: Record<string, boolean>;
  };
  history: {
    projectCollapsedByPath: Record<string, boolean>;
  };
}
```

说明:

- key 一律使用路径而不是运行时 id

- project 使用`project.path`

- worktree 使用`worktree.path`

- `历史`页顶层项目组使用`projectPath`

选择路径作为 key 的原因:

- 满足“按项目记,但不入侵项目目录”

- 比`projectId`/`worktreeId`更接近稳定身份

- 与“路径变化视为新项目”这一用户决策完全一致

### 存储策略

- 使用应用本地存储,建议继续沿用已有`localStorage`模式

- 使用单独 storage key,例如`termcanvas:left-panel-ui-state:v1`

- 读取失败或 JSON 非法时静默回退到默认空状态

- 写入失败时静默忽略,不阻塞 UI 交互

不需要在项目目录、worktree 目录、仓库根目录落任何文件。

### 行为规则

### `会话`页

- 项目展开/收起状态以用户最后一次操作为准

- worktree / 分支展开/收起状态以用户最后一次操作为准

- 新出现的项目默认展开

- 已存在项目下新出现的 worktree 默认展开

- 但不强行展开它的父项目

最后一条的具体含义:

- 如果项目当前已被用户折叠,后台扫描到新的 worktree,不自动把项目展开

- 仅给这个新 worktree 记录一个默认“展开”状态

- 用户之后手动展开该项目时,新 worktree 会直接处于展开状态

这样可以同时满足“尊重用户当前视图”和“给新数据合理默认值”。

### `历史`页

- 只恢复顶层项目组展开/收起状态

- 项目组内的 worktree 分组每次按当前默认 UI 行为渲染

- 项目组内的会话树节点每次按当前默认 UI 行为渲染

- `show more`每次回到默认值,不做记忆

这意味着`main`上新增的 history worktree 分组能力仍然保留,但它们不参与本次持久化。

### 默认值规则

首次没有本地状态时:

- `会话`页项目默认展开

- `会话`页 worktree 默认展开

- `历史`页顶层项目组默认按现有实现行为决定

如果 store 中缺少某个新路径的记录:

- 对`会话`页项目和 worktree 视为默认展开

- 对`历史`页顶层项目组视为默认展开

### 清理策略

不做专门的后台清理任务。

在读取和写回时做轻量裁剪:

- 当前不存在的`project.path`不参与渲染

- 当前不存在的`worktree.path`不参与渲染

- `历史`页当前不存在的`projectPath`不参与渲染

写回时可以顺手删掉这些无效 key,避免本地状态无限增长。

### 实现落点

#### 1. 新增 store

- 新增`src/stores/leftPanelUiStateStore.ts`

- 提供:

  - 初始化读取

  - 持久化写回

  - 读取某个 project 是否折叠

  - 读取某个 worktree 是否折叠

  - toggle project 折叠

  - toggle worktree 折叠

  - 读取`历史`页顶层项目组是否折叠

  - toggle`历史`页顶层项目组折叠

  - 裁剪无效 key

#### 2. 调整`会话`页项目树

- `src/stores/sessionPanelCollapseStore.ts`不再作为最终持久化来源

- `src/components/ProjectTree.tsx`里的 project/worktree 折叠逻辑改为读写新 store

- 运行时 UI 仍然可以保留现有点击区域和交互方式,只替换状态来源

#### 3. 调整`历史`页顶层项目组

- `src/components/SessionsPanel.tsx`中的`HistorySection`

- 仅将顶层项目组的`collapsed`状态接入新 store

- 不改动`expandedNodes`、worktree group expanded、`groupLimits`的持久化策略,它们继续保持非持久化

#### 4. 保留现有历史持久化

- `pin`/`hide`相关`localStorage`逻辑保持原样

- 不与新 store 合并,避免扩大改动面

### 风险与对策

#### key 选型不稳定

风险:

- 如果使用运行时 id 做持久化 key,可能跨重启后失效或串状态

对策:

- 一律使用路径 key

#### 新主分支历史模型继续演进

风险:

- `main`已经引入 history worktree 分组,后续历史结构可能继续演化

对策:

- 本次只持久化顶层项目组状态,避免和内部历史结构绑定过深

#### store 与现有默认展开逻辑冲突

风险:

- 新增 store 后,可能覆盖当前“首次渲染默认展开”的体验

对策:

- store 缺少记录时统一回退到默认展开

- 只在用户显式操作后才写入折叠状态

### 测试策略

需要覆盖以下场景:

1. `会话`页项目折叠后:

    - 切换到`历史`页再切回,状态保持

    - 关闭并重新打开应用,状态恢复

2. `会话`页 worktree 折叠后:

    - 刷新项目树数据,状态保持

    - 重启应用,状态恢复

3. 已存在项目下新增 worktree:

    - 父项目若已折叠,不会被自动展开

    - 用户手动展开父项目后,新 worktree 默认处于展开状态

4. `历史`页顶层项目组折叠后:

    - 切 tab 后状态保持

    - 重启应用后状态恢复

5. `历史`页 worktree 分组和会话树节点:

    - 切换或重启后不保证恢复,仍按默认行为展示

6. 项目路径变化:

    - 旧路径状态不应用到新路径

7. 非法本地存储:

    - JSON 损坏时不崩溃,回退默认状态

### 里程碑

1. 新增左侧面板 UI 持久化 store

2. 接管`会话`页项目和 worktree 折叠状态

3. 接管`历史`页顶层项目组折叠状态

4. 补充测试

5. 手工验证切 tab、刷新、重启场景

### 结论

本方案以最小可用范围完成“记住会话/历史面板展开状态”的目标:

- `会话`页记两层

- `历史`页只记顶层

- 存储只在应用本地

- 不入侵项目目录

- 与`main`上已存在的 history worktree 分组能力兼容,但不被其复杂度拖着走
