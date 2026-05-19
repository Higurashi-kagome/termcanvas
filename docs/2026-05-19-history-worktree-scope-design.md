### 历史面板补充 Worktree 会话设计

#### 背景

当前历史面板已经能展示当前画布作用域内的历史会话，但作用域匹配仍然偏保守。

以`termcanvas`项目为例，项目根目录下的会话可以正常显示，但像`E:\GitHub\open-source\termcanvas\.worktrees\feat-auto-focus`这类 worktree 目录中的会话，即使已经在当前项目的 worktree 列表中出现，也不会稳定出现在历史面板里。

这会带来两个问题：

- 历史面板显示不完整，用户明知道某个 worktree 里有会话，却在历史里看不到

- 历史面板与当前会话面板的工作区语义不一致，前者只覆盖项目根目录，后者已经能识别并展示项目下的 worktree

本次工作不是要重做历史树，也不是要做任意子目录递归扫描，而是做一个最小增量：让历史面板补上“当前项目已识别 worktree 目录”的会话显示能力。

#### 目标

- 保持历史面板当前的父项目分组结构

- 保持项目根目录会话的当前展示方式不变

- 新增对当前项目已识别`worktree.path`目录的历史会话扫描

- 将命中 worktree 目录的会话在父项目下显示为独立子组

- 让历史面板与当前会话面板在“项目包含 worktree”这一层语义上保持一致

- 控制实现复杂度与性能代价，不引入递归目录归属规则

#### 非目标

- 不递归扫描`worktree.path`的后代目录

- 不把任意子目录中的会话都自动视为项目历史

- 不把 worktree 会话并回项目根目录历史列表

- 不修改现有 session 父子树关系的建立规则

- 不引入新的模糊匹配、最长前缀归属或启发式目录推断

- 不调整 Cmd+K 搜索结果的展示模型

#### 用户体验

历史面板的顶层仍然是父项目，例如`termcanvas`。

项目根目录会话继续按当前方式直接列在项目下，不单独创建“项目根目录”子组。

当某个项目存在已识别 worktree，且该 worktree 目录下存在历史会话时，在该项目下额外显示独立子组，例如：

- `termcanvas`

- `feat-auto-focus`

- `fix-history-panel`

这些 worktree 子组只承载`session.projectDir === worktree.path`的会话，不承载后代目录会话。

如果某个 worktree 当前没有命中任何历史会话，则不显示该 worktree。

#### 作用域规则

历史面板的数据作用域从“仅项目根目录”扩展为“项目根目录 + 当前项目已识别的 worktree 目录集合”。

这里的“已识别 worktree”直接复用当前项目树 / 会话面板已经拿到的`worktree.path`，不在历史索引层重新发明一套 worktree 发现机制。

作用域只做精确路径匹配：

- `session.projectDir === project.path`，视为项目根目录会话

- `session.projectDir === worktree.path`，视为该 worktree 会话

以下情况不纳入本次范围：

- `session.projectDir`只是位于`worktree.path`之下

- `session.projectDir`与某个 worktree 只是路径前缀接近

- `session.projectDir`需要通过归一化之外的额外推断才能确认归属

路径比较继续沿用现有的路径归一化逻辑，确保 Windows 下不同斜杠形式和盘符大小写不会造成误判。

#### 展示规则

父项目组内部由两层内容组成：

- 项目根目录会话列表

- worktree 子组列表

项目根目录会话保持当前排序与交互方式，不因为本次改动而改变位置、折叠规则或打开 replay 的行为。

worktree 会话不混入项目根目录列表，而是进入对应的 worktree 子组。

每个 worktree 子组的标题建议直接使用 worktree 名称，与当前会话面板保持一致，例如`feat-auto-focus`。该名称默认取`worktree.path`的最后一个路径段，而不是完整绝对路径。

worktree 子组内部的会话排序继续沿用当前历史列表的时间倒序规则。

如果后续某个 worktree 组内部仍然存在 confirmed parent-child 关系，则继续沿用现有树渲染能力。本次变化只新增分组维度，不改变组内会话树逻辑。

#### 数据模型调整

当前历史数据按`projectDir`分桶，不足以表达“一个父项目下包含多个 worktree 子组”的结构。

建议把历史面板消费的数据模型从“项目树数组”扩展为“父项目组数组”，每个父项目组内再拆成根目录会话和 worktree 子组。

建议结构如下：

```ts
interface SessionHistoryWorktreeGroup {
  worktreePath: string;
  worktreeLabel: string;
  tree: SessionHistoryProjectTree;
}

interface SessionHistoryCanvasProjectGroup {
  projectPath: string;
  projectLabel: string;
  projectTree: SessionHistoryProjectTree | null;
  worktrees: SessionHistoryWorktreeGroup[];
  latestActivityAt: string;
}
```

其中：

- `projectTree`承载项目根目录会话；如果项目根目录没有会话，则允许为`null`

- `worktrees`只包含命中历史会话的 worktree 组，不返回空 worktree

- `tree`继续复用现有`SessionHistoryProjectTree`结构，避免重写组内树逻辑

这意味着本次变更不是推翻现有树模型，而是在其外层再包一层“父项目 -> 子组”的组织结构。

#### 主进程职责

主进程需要从“接收一组 projectDirs 并返回按 projectDir 建树”调整为“接收当前画布项目及其 worktrees 的作用域描述，并返回父项目分组结果”。

建议新增面向历史面板的查询输入结构：

```ts
interface HistoryScopeProjectInput {
  projectPath: string;
  worktreePaths: string[];
}
```

主进程处理流程：

1. 接收当前画布中每个项目的`projectPath`与`worktreePaths`

2. 将所有`projectPath`和`worktreePath`展开成待匹配路径集合

3. 继续复用现有 session 索引逻辑，枚举候选会话并解析其`session.projectDir`

4. 只保留精确命中某个`projectPath`或某个`worktreePath`的会话

5. 对命中项目根目录的会话按现有方式构建`projectTree`

6. 对命中某个 worktree 目录的会话分别构建对应 worktree 子组的`tree`

7. 过滤掉没有任何会话的 worktree

8. 将根目录 tree 与 worktree trees 重新组合成父项目分组结果返回给前端

这样做的好处是：

- 精确复用已有 session 元数据解析与 confirmed 关系建树能力

- 不需要在前端做二次归属判断

- 可以在主进程内统一处理路径匹配、去重和排序

#### 前端职责

前端继续负责：

- 维护展开状态

- 渲染项目标题、会话树和 worktree 子组

- 响应 history changed 事件并触发刷新

前端不负责：

- 根据路径自行推断会话属于哪个 worktree

- 把平面会话重新分桶

- 在 renderer 侧做额外的递归目录匹配

`SessionsPanel`侧的主要调整应是：

- 当前传给历史面板的数据不再只是`string[] projectDirs`

- 改为传入“每个父项目及其 worktree 列表”的作用域描述

- 历史面板收到主进程返回的父项目分组结果后，按“根目录会话 + worktree 子组”的顺序渲染

- worktree 子组标题直接复用 worktree 名称，不再额外拼接父项目名

#### 去重与一致性

同一 session 只能出现在一个位置：

- 要么出现在父项目的根目录会话列表中

- 要么出现在某个 worktree 子组中

不能同时出现在两处。

由于本次仅采用精确路径匹配，归属唯一性规则很简单：

- 命中`projectPath`就归项目根目录

- 命中某个`worktreePath`就归该 worktree 子组

- 其余全部忽略

如果未来出现重复 worktree path 或非法作用域输入，应在主进程组装作用域时先去重，再进入索引匹配流程。

#### 性能与范围控制

本次设计刻意不做`worktree.path`后代目录扫描，主要原因如下：

- 当前最明确的用户痛点是`.worktrees/<name>`这类 worktree 根目录会话漏显

- 精确匹配 worktree 根目录已经能覆盖大部分实际使用场景

- 不递归后代目录可以显著降低范围膨胀和误收风险

- 不需要引入更复杂的路径前缀归属、最长前缀选择和歧义处理

性能上，本次新增的只是更多精确匹配目标，而不是更深层的目录遍历，因此总体仍应保持在当前历史索引模型可接受的范围内。

#### 错误处理

以下情况直接降级为“不显示该 worktree 历史”，而不是做模糊补救：

- 当前项目的 worktree 列表为空

- 某个 worktree path 无法通过路径归一化稳定比较

- 会话解析失败，拿不到可靠的`session.projectDir`

- worktree 子组建树失败

降级原则：

- 单个 worktree 失败不影响父项目和其他 worktree 的历史显示

- 根目录会话展示能力不受本次新增逻辑影响

- 无法确认归属时宁可不显示，也不误挂到错误子组

#### 测试范围

建议新增或调整以下测试：

- 项目根目录会话仍按当前方式显示在父项目下

- `session.projectDir === worktree.path`时，会话进入对应 worktree 子组

- worktree 会话不会同时出现在项目根目录列表中

- 没有会话的 worktree 不显示

- 不命中`projectPath`或`worktreePath`的会话不会被历史面板收进来

- Windows 路径在不同斜杠形式下仍能正确命中对应 worktree

- worktree 子组内部仍能保留现有 confirmed parent-child 树结构

- history changed 事件命中某个 worktree 作用域时，前端会正确刷新对应父项目分组

#### 实施边界

建议主要改动集中在以下区域：

- `shared/sessions.ts`

- `electron/session-search-index.ts`

- `electron/main.ts`

- `src/components/SessionsPanel.tsx`

- 与历史面板展示模型相关的辅助文件

本次不建议改动：

- `session-scanner`的底层 session 解析职责

- confirmed parent-child 关系规则

- Replay 打开逻辑

- Cmd+K 的全文搜索体验

#### 成功标准

完成后应满足以下条件：

1. 项目根目录会话展示行为保持现状

2. 当前项目下已识别 worktree 目录中的历史会话可以显示出来

3. worktree 会话在父项目下显示为独立子组，而不是混入根目录列表

4. worktree 子组标题与当前会话面板一致，直接显示 worktree 名称

5. 没有会话记录的 worktree 不显示

6. 不扫描`worktree.path`后代目录

7. 不因本次改动破坏现有 confirmed 会话树关系展示

8. 历史面板与当前会话面板在“项目包含 worktree”这一层语义上保持一致
