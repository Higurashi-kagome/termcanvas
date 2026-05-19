# History Worktree Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让历史面板在保持项目根目录会话现状的同时，额外显示当前项目已识别 worktree 目录中的历史会话，并以 worktree 名称作为独立子组标题。

**Architecture:** 在现有`SessionHistoryProjectTree`组内树结构外，再增加一层“父项目 -> 根目录历史 + worktree 子组”的聚合结构。主进程负责基于项目作用域做精确路径匹配与分组，renderer 只消费聚合结果并渲染，不在前端做路径归属推断。

**Tech Stack:** TypeScript、Electron IPC、React、现有 session history index / tree 构建逻辑、tsx 测试

---

### 文件结构

**已有文件职责：**

- `shared/sessions.ts`
  - 历史树共享类型，目前只定义`SessionHistoryProjectTree`

- `electron/session-search-index.ts`
  - 主进程历史索引入口，负责基于`projectDirs`筛选会话并构建树

- `electron/main.ts`
  - 暴露`search:sessions:list-trees` IPC，并转发历史更新事件

- `electron/preload.ts`
  - renderer 侧`window.termcanvas.search.listSessionTrees()`桥接

- `src/types/index.ts`
  - renderer 暴露 API 的 TS 类型

- `src/components/SessionsPanel.tsx`
  - 历史面板 UI 与当前画布 worktree 作用域计算

- `src/components/historySectionModel.ts`
  - 历史面板的纯模型辅助函数

- `tests/session-search-index.test.ts`
  - 主进程历史索引行为测试

- `tests/history-section-model.test.ts`
  - 历史面板模型测试

**本次建议新增或修改：**

- Modify: `shared/sessions.ts`
  - 新增“父项目 + worktree 子组”共享类型与查询输入类型

- Modify: `electron/session-search-index.ts`
  - 新增按项目作用域聚合根目录历史与 worktree 历史的入口

- Modify: `electron/main.ts`
  - 将历史树 IPC 输入从`string[]`切换为项目作用域对象

- Modify: `electron/preload.ts`
  - 暴露新的`listSessionGroups()`或更新后的`listSessionTrees()`签名

- Modify: `src/types/index.ts`
  - 同步 renderer 侧类型签名

- Modify: `src/components/historySectionModel.ts`
  - 新增父项目分组与 worktree 子组过滤/排序辅助函数

- Modify: `src/components/SessionsPanel.tsx`
  - 传入项目作用域并按“根目录会话 + worktree 子组”渲染

- Modify: `tests/session-search-index.test.ts`
  - 增加 worktree 精确匹配与空 worktree 过滤测试

- Modify: `tests/history-section-model.test.ts`
  - 增加 worktree 分组模型测试

### Task 1: 定义共享历史分组类型

**Files:**
- Modify: `shared/sessions.ts`
- Test: `tests/history-section-model.test.ts`

- [ ] **Step 1: 在共享类型文件中加入项目作用域输入与历史分组类型**

```ts
export interface SessionHistoryScopeProject {
  projectPath: string;
  worktreePaths: string[];
}

export interface SessionHistoryWorktreeGroup {
  worktreePath: string;
  worktreeLabel: string;
  tree: SessionHistoryProjectTree;
}

export interface SessionHistoryProjectGroup {
  projectPath: string;
  projectLabel: string;
  projectTree: SessionHistoryProjectTree | null;
  worktrees: SessionHistoryWorktreeGroup[];
  latestActivityAt: string;
}
```

- [ ] **Step 2: 运行目标测试确认现有引用在类型层面失败**

Run: `pnpm exec tsx --test tests/history-section-model.test.ts`
Expected: FAIL，提示历史分组辅助函数或类型尚未实现

- [ ] **Step 3: 最小修正导出顺序与命名，确保共享类型可被 renderer / main 同时引用**

```ts
export interface SessionHistoryChangedEvent {
  reason:
    | "session_attached"
    | "session_detached"
    | "session_scan_changed";
  projectDirs: string[];
}
```

说明：本轮不改`SessionHistoryChangedEvent`结构，只复用现有`projectDirs`刷新语义，避免扩大范围。

- [ ] **Step 4: 重新运行共享类型相关测试**

Run: `pnpm exec tsx --test tests/history-section-model.test.ts`
Expected: PASS 或至少不再因共享类型缺失失败

- [ ] **Step 5: 提交**

```bash
git add shared/sessions.ts tests/history-section-model.test.ts
git commit -m "feat: add session history group types"
```

### Task 2: 在主进程索引层按项目 + worktree 精确分组

**Files:**
- Modify: `electron/session-search-index.ts`
- Test: `tests/session-search-index.test.ts`

- [ ] **Step 1: 为 session-search-index 增加一个失败测试，覆盖项目根目录与 worktree 精确匹配**

```ts
test("listSessionGroupsForScope keeps project-root sessions at the project level and groups exact worktree sessions separately", async () => {
  const scope = [
    {
      projectPath: "/repo",
      worktreePaths: ["/repo/.worktrees/feat-auto-focus"],
    },
  ];

  const groups = await listSessionGroupsForScope(scope);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.projectPath, "/repo");
  assert.equal(groups[0]?.projectTree?.projectDir, "/repo");
  assert.deepEqual(
    groups[0]?.worktrees.map((group) => group.worktreePath),
    ["/repo/.worktrees/feat-auto-focus"],
  );
});
```

- [ ] **Step 2: 为“空 worktree 不返回”和“worktree 后代目录不计入”增加失败测试**

```ts
test("listSessionGroupsForScope omits worktrees with no exact-match sessions", async () => {
  const scope = [
    {
      projectPath: "/repo",
      worktreePaths: ["/repo/.worktrees/unused"],
    },
  ];

  const groups = await listSessionGroupsForScope(scope);

  assert.equal(groups[0]?.worktrees.length, 0);
});

test("listSessionGroupsForScope does not include descendant directories under a worktree", async () => {
  const scope = [
    {
      projectPath: "/repo",
      worktreePaths: ["/repo/.worktrees/feat-auto-focus"],
    },
  ];

  const groups = await listSessionGroupsForScope(scope);

  assert.equal(
    groups[0]?.worktrees.some(
      (group) => group.tree.projectDir === "/repo/.worktrees/feat-auto-focus/subdir",
    ),
    false,
  );
});
```

- [ ] **Step 3: 运行索引测试确认失败**

Run: `pnpm exec tsx --test tests/session-search-index.test.ts`
Expected: FAIL，提示`listSessionGroupsForScope`不存在或行为不符

- [ ] **Step 4: 在`session-search-index.ts`中实现按作用域聚合的新入口**

```ts
export async function listSessionGroupsForScope(
  scopeProjects: SessionHistoryScopeProject[],
): Promise<SessionHistoryProjectGroup[]> {
  if (scopeProjects.length === 0) return [];

  const allProjectDirs = scopeProjects.flatMap((scope) => [
    scope.projectPath,
    ...scope.worktreePaths,
  ]);
  const entries = await listSessionsForProjects(allProjectDirs);

  return scopeProjects
    .map((scope) => buildScopedHistoryGroup(scope, entries))
    .filter((group): group is SessionHistoryProjectGroup => group !== null)
    .sort((a, b) => b.latestActivityAt.localeCompare(a.latestActivityAt));
}
```

- [ ] **Step 5: 实现父项目组装辅助函数，只做精确匹配**

```ts
function buildScopedHistoryGroup(
  scope: SessionHistoryScopeProject,
  entries: SessionSearchEntry[],
): SessionHistoryProjectGroup | null {
  const projectEntries = entries.filter(
    (entry) =>
      normalizeProjectPathForMatch(entry.projectDir) ===
      normalizeProjectPathForMatch(scope.projectPath),
  );

  const worktrees = scope.worktreePaths
    .map((worktreePath) => {
      const worktreeEntries = entries.filter(
        (entry) =>
          normalizeProjectPathForMatch(entry.projectDir) ===
          normalizeProjectPathForMatch(worktreePath),
      );
      if (worktreeEntries.length === 0) return null;
      return {
        worktreePath,
        worktreeLabel: path.basename(worktreePath),
        tree: buildHistoryProjectTrees(
          worktreeEntries.map(mapEntryToTreeInput),
        )[0]!,
      };
    })
    .filter((group): group is SessionHistoryWorktreeGroup => group !== null);

  const projectTree =
    projectEntries.length > 0
      ? buildHistoryProjectTrees(projectEntries.map(mapEntryToTreeInput))[0]!
      : null;

  if (!projectTree && worktrees.length === 0) return null;

  return {
    projectPath: scope.projectPath,
    projectLabel: path.basename(scope.projectPath),
    projectTree,
    worktrees,
    latestActivityAt: resolveLatestActivity(projectTree, worktrees),
  };
}
```

- [ ] **Step 6: 复用现有 tree 构建映射，不改 confirmed parent-child 逻辑**

```ts
function mapEntryToTreeInput(entry: SessionSearchEntry): HistoryTreeInputEntry {
  return {
    sessionId: entry.sessionId,
    provider: entry.provider,
    projectDir: entry.projectDir,
    filePath: entry.filePath,
    firstPrompt: entry.firstPrompt,
    startedAt: entry.startedAt,
    lastActivityAt: entry.lastActivityAt,
    estimatedMessageCount: entry.estimatedMessageCount,
    fileSize: entry.fileSize,
    confirmedParentSessionId: entry.confirmedParentSessionId,
  };
}
```

- [ ] **Step 7: 运行索引测试确认通过**

Run: `pnpm exec tsx --test tests/session-search-index.test.ts`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add electron/session-search-index.ts tests/session-search-index.test.ts
git commit -m "feat: group history sessions by project worktree scope"
```

### Task 3: 接通 IPC 与 preload 类型

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/index.ts`
- Test: `tests/session-search-index.test.ts`

- [ ] **Step 1: 先更新 renderer 类型定义，令旧调用在编译层失败**

```ts
listSessionGroups: (
  scopeProjects: import("../../shared/sessions").SessionHistoryScopeProject[],
) => Promise<import("../../shared/sessions").SessionHistoryProjectGroup[]>;
```

- [ ] **Step 2: 运行类型检查确认 IPC 桥接尚未跟上**

Run: `rtk tsc`
Expected: FAIL，提示`preload.ts`或`SessionsPanel.tsx`仍在调用旧签名

- [ ] **Step 3: 在 main 进程新增或替换历史分组 IPC**

```ts
ipcMain.handle(
  "search:sessions:list-groups",
  async (
    _event,
    scopeProjects: SessionHistoryScopeProject[],
  ): Promise<SessionHistoryProjectGroup[]> => {
    try {
      return await listSessionGroupsForScope(scopeProjects ?? []);
    } catch (err) {
      console.error("[search:sessions:list-groups] failed", err);
      return [];
    }
  },
);
```

- [ ] **Step 4: 在 preload 中暴露新的桥接方法**

```ts
listSessionGroups: (scopeProjects) =>
  ipcRenderer.invoke(
    "search:sessions:list-groups",
    scopeProjects,
  ) as Promise<import("../shared/sessions").SessionHistoryProjectGroup[]>,
```

- [ ] **Step 5: 在`src/types/index.ts`同步 browser 侧 API 类型**

```ts
listSessionGroups: (
  scopeProjects: import("../../shared/sessions").SessionHistoryScopeProject[],
) => Promise<import("../../shared/sessions").SessionHistoryProjectGroup[]>;
```

- [ ] **Step 6: 运行类型检查确认桥接通过**

Run: `rtk tsc`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add electron/main.ts electron/preload.ts src/types/index.ts
git commit -m "feat: expose history session groups over ipc"
```

### Task 4: 为历史面板增加父项目 + worktree 子组模型

**Files:**
- Modify: `src/components/historySectionModel.ts`
- Test: `tests/history-section-model.test.ts`

- [ ] **Step 1: 新增模型测试，覆盖空 worktree 过滤与 worktree 标题直显**

```ts
test("groupHistoryProjectSections keeps project tree at the top level and preserves worktree labels", () => {
  const groups = buildVisibleHistoryGroups([
    {
      projectPath: "/repo",
      projectLabel: "repo",
      projectTree: {
        projectDir: "/repo",
        roots: [],
        sessionCount: 1,
        rootCount: 1,
        latestActivityAt: "2026-05-19T10:00:00.000Z",
      },
      worktrees: [
        {
          worktreePath: "/repo/.worktrees/feat-auto-focus",
          worktreeLabel: "feat-auto-focus",
          tree: {
            projectDir: "/repo/.worktrees/feat-auto-focus",
            roots: [],
            sessionCount: 1,
            rootCount: 1,
            latestActivityAt: "2026-05-19T11:00:00.000Z",
          },
        },
      ],
      latestActivityAt: "2026-05-19T11:00:00.000Z",
    },
  ]);

  assert.equal(groups[0]?.projectLabel, "repo");
  assert.equal(groups[0]?.worktrees[0]?.worktreeLabel, "feat-auto-focus");
});
```

- [ ] **Step 2: 运行模型测试确认失败**

Run: `pnpm exec tsx --test tests/history-section-model.test.ts`
Expected: FAIL，提示新分组辅助函数尚未实现

- [ ] **Step 3: 在 historySectionModel 中加入父项目可见分组辅助函数**

```ts
export function filterHiddenProjectTree(
  tree: SessionHistoryProjectTree | null,
  hidden: ReadonlySet<string>,
): SessionHistoryProjectTree | null {
  if (!tree) return null;
  return filterProjectTree(tree, hidden);
}

export function buildVisibleHistoryGroups(
  groups: SessionHistoryProjectGroup[],
  hidden: ReadonlySet<string> = new Set(),
): SessionHistoryProjectGroup[] {
  return groups
    .map((group) => {
      const projectTree = filterHiddenProjectTree(group.projectTree, hidden);
      const worktrees = group.worktrees
        .map((worktree) => ({
          ...worktree,
          tree: filterProjectTree(worktree.tree, hidden),
        }))
        .filter(
          (worktree): worktree is SessionHistoryWorktreeGroup & {
            tree: SessionHistoryProjectTree;
          } => worktree.tree !== null,
        );

      if (!projectTree && worktrees.length === 0) return null;
      return { ...group, projectTree, worktrees };
    })
    .filter((group): group is SessionHistoryProjectGroup => group !== null);
}
```

- [ ] **Step 4: 运行模型测试确认通过**

Run: `pnpm exec tsx --test tests/history-section-model.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/historySectionModel.ts tests/history-section-model.test.ts
git commit -m "feat: add history project group helpers"
```

### Task 5: 更新 SessionsPanel 历史面板渲染

**Files:**
- Modify: `src/components/SessionsPanel.tsx`
- Test: `tests/history-section-model.test.ts`

- [ ] **Step 1: 先把历史作用域从扁平 path 数组改为项目作用域对象，令旧渲染逻辑在类型层失败**

```ts
const historyScopeProjects = useMemo(
  () =>
    projects.map((project) => ({
      projectPath: project.path,
      worktreePaths: project.worktrees.map((worktree) => worktree.path),
    })),
  [projects],
);
```

- [ ] **Step 2: 运行类型检查确认`HistorySection`仍依赖旧数据结构**

Run: `rtk tsc`
Expected: FAIL，提示`projectDirs`或`listSessionTrees`调用签名不匹配

- [ ] **Step 3: 在 HistorySection 中切换为加载父项目分组结果**

```ts
const [projectGroups, setProjectGroups] = useState<SessionHistoryProjectGroup[]>(
  [],
);

void window.termcanvas.search
  .listSessionGroups(scopeProjects)
  .then((groups) => {
    if (cancelled) return;
    setProjectGroups(groups);
  })
  .catch(() => {
    if (cancelled) return;
    setProjectGroups([]);
  });
```

- [ ] **Step 4: 用“根目录会话 + worktree 子组”的顺序渲染每个父项目**

```tsx
{visibleGroups.map((group) => (
  <div key={group.projectPath} className="mb-0.5 last:mb-0">
    <ProjectHistoryHeader
      projectLabel={group.projectLabel}
      count={countGroupSessions(group)}
      latestActivityAt={group.latestActivityAt}
    />
    {group.projectTree &&
      renderProjectRoots(group.projectTree, {
        expandedNodes,
        childCountLabel,
        onOpen,
        onToggleExpand: toggleNode,
        onHide: hideSession,
        onPin: pinSession,
        onUnpin: unpinSession,
        t,
      })}
    {group.worktrees.map((worktree) => (
      <WorktreeHistoryGroup
        key={worktree.worktreePath}
        label={worktree.worktreeLabel}
        tree={worktree.tree}
        expandedNodes={expandedNodes}
        childCountLabel={childCountLabel}
        onToggleExpand={toggleNode}
        onOpen={onOpen}
        onHide={hideSession}
        onPin={pinSession}
        onUnpin={unpinSession}
        t={t}
      />
    ))}
  </div>
))}
```

- [ ] **Step 5: 保持刷新机制只依赖现有`projectDirs`交集，不扩展 history changed 事件结构**

```ts
const scopePathSet = useMemo(
  () =>
    new Set(
      scopeProjects.flatMap((scope) => [scope.projectPath, ...scope.worktreePaths]),
    ),
  [scopeProjects],
);
```

说明：`shouldRefreshHistorySection()`可保留现有`string[]`变更判断，只需传入展开后的 scope path 列表。

- [ ] **Step 6: 运行类型检查与目标测试**

Run: `rtk tsc`
Expected: PASS

Run: `pnpm exec tsx --test tests/history-section-model.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/components/SessionsPanel.tsx
git commit -m "feat: render history worktree groups in sessions panel"
```

### Task 6: 完整回归与文档收尾

**Files:**
- Modify: `docs/2026-05-19-history-worktree-scope-design.md`（仅当实现后需补充已决策名称时）
- Test: `tests/session-search-index.test.ts`
- Test: `tests/history-section-model.test.ts`

- [ ] **Step 1: 运行主回归测试集合**

Run: `pnpm exec tsx --test tests/session-search-index.test.ts tests/history-section-model.test.ts tests/session-history-tree.test.ts`
Expected: PASS

- [ ] **Step 2: 运行类型检查**

Run: `rtk tsc`
Expected: PASS

- [ ] **Step 3: 若设计文档措辞与最终命名不一致，做最小同步**

```md
- worktree 子组标题直接显示 worktree 名称
- 没有会话记录的 worktree 不显示
```

说明：只有在实现过程中实际命名与 spec 轻微偏差时才更新，不新增范围。

- [ ] **Step 4: 确认工作树干净**

Run: `rtk git status`
Expected: `clean — nothing to commit`

- [ ] **Step 5: 提交**

```bash
git add tests/session-search-index.test.ts tests/history-section-model.test.ts docs/2026-05-19-history-worktree-scope-design.md
git commit -m "test: cover history worktree scope behavior"
```

### Self-Review

**Spec coverage:**

- “项目根目录会话保持现状”由 Task 2、Task 5 覆盖
- “精确匹配 worktree.path”由 Task 2 覆盖
- “worktree 标题直接显示名称”由 Task 4、Task 5 覆盖
- “空 worktree 不显示”由 Task 2、Task 4、Task 5 覆盖
- “不扫描 worktree 后代目录”由 Task 2 覆盖
- “不改 confirmed parent-child 规则”由 Task 2 明确复用现有 tree builder

**Placeholder scan:**

- 无`TODO`、`TBD`、`implement later`
- 每个代码步骤都给出了明确接口或实现片段
- 每个验证步骤都给出了具体命令

**Type consistency:**

- 统一使用`SessionHistoryScopeProject`
- 统一使用`SessionHistoryProjectGroup`
- 主进程入口统一命名为`listSessionGroupsForScope`
- preload / types / renderer 统一使用`listSessionGroups`
