# History Worktree Group Visual Implementation Plan

> **For agentic workers:** implement this task-by-task and keep the changes scoped to the history panel UI. Do not expand the worktree scan range or change session归属规则.

**Goal:** 让历史面板中的 worktree 子组在视觉上更像“有子会话的主会话根节点”，但仍能明确区分其分组身份；worktree 默认折叠，点击整行只展开/折叠，且在父项目内部按最近活跃时间排序。

**Architecture:** 复用现有历史分组数据结构与主进程精确匹配结果，只调整 renderer 侧的分组头渲染、折叠状态与排序呈现。worktree 子组仍由`SessionHistoryProjectGroup`承载，不新增扫描逻辑、不改变 IPC 作用域模型。

**Tech Stack:** TypeScript、React、现有 historySectionModel、Electron IPC、tsx tests

---

### 文件结构

**已有文件职责：**

- `src/components/SessionsPanel.tsx`
  - 历史面板主渲染入口，负责项目组、历史组和展开状态

- `src/components/historySectionModel.ts`
  - 历史分组/过滤的纯函数模型

- `shared/sessions.ts`
  - 历史分组共享类型

- `tests/history-section-model.test.ts`
  - 历史分组模型测试

- `tests/session-search-index.test.ts`
  - 主进程历史分组与精确匹配测试

**本次建议修改：**

- Modify: `src/components/SessionsPanel.tsx`
  - 调整 worktree 子组的分组头样式与默认折叠行为
  - 保持项目根目录会话展示不变
  - 保持项目组内按最新活动排序

- Modify: `src/components/historySectionModel.ts`
  - 如需抽出 worktree 子组排序或可见性辅助函数，在此集中处理

- Modify: `tests/history-section-model.test.ts`
  - 增加 worktree 分组排序与可见性相关测试

- Optional: `tests/session-search-index.test.ts`
  - 如果需要补一条“group 顺序仍按 latestActivityAt”回归测试，可放在这里

---

### Task 1: 固化 worktree 子组的视觉语义

**Files:**
- Modify: `src/components/SessionsPanel.tsx`

- [ ] 先把 worktree 子组头从“轻量标签行”改成“分组版主会话头”，保持与包含子会话的主会话行接近的结构。

建议结构：

- 左侧折叠箭头
- 分支图标
- worktree 名称
- 第二行显示最近活跃时间和会话数

- [ ] 确保分支图标放在折叠箭头后、标题前。

- [ ] 保持 worktree 子组头不直接打开 replay，仅负责展开/折叠。

- [ ] 保持 worktree 默认折叠，不强制展开。

### Task 2: 保持项目组内部按最近活跃时间排序

**Files:**
- Modify: `src/components/SessionsPanel.tsx`
- Modify: `src/components/historySectionModel.ts`

- [ ] 去掉“worktree 永远前置”的硬编码顺序。

- [ ] 让项目根目录会话块与 worktree 子组块在同一层级按`latestActivityAt`倒序排列。

- [ ] 保持没有会话的 worktree 不显示。

- [ ] 保持项目根目录会话的现有排序和展开行为不变。

### Task 3: 统一交互行为

**Files:**
- Modify: `src/components/SessionsPanel.tsx`

- [ ] 让 worktree 子组整行点击只切换折叠状态。

- [ ] 保持子会话树内部的现有点击行为不变。

- [ ] 保持 worktree 图标只承担身份提示，不增加额外交互。

### Task 4: 补回归测试

**Files:**
- Modify: `tests/history-section-model.test.ts`
- Optional: `tests/session-search-index.test.ts`

- [ ] 增加 worktree 子组排序测试，确保它不会被强制前置。

- [ ] 增加 worktree 可见性测试，确保空 worktree 不渲染。

- [ ] 如果需要，增加 worktree 标题 label 的稳定性测试，确保标题仍直接使用 worktree 名称。

### Task 5: 验证

- [ ] 运行类型检查。

Run: `rtk tsc`

- [ ] 运行历史模型与索引测试。

Run: `pnpm exec tsx --test tests/history-section-model.test.ts tests/session-search-index.test.ts tests/session-history-tree.test.ts`

- [ ] 手动启动开发版确认：

- worktree 默认折叠
- worktree 子组使用分支图标
- worktree 子组点击只展开/折叠
- worktree 排序不再固定前置

---

### Self-Review

**Scope check:** 只改历史面板视觉与交互，不改扫描范围，不改归属规则。

**Consistency check:** 与现有 worktree scope 设计一致，保留项目根目录会话现状。

**Test check:** 至少覆盖排序、可见性和标题语义。

