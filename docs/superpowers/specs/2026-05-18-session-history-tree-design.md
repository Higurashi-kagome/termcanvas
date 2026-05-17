### Session History Tree 设计

#### 背景

当前 TermCanvas 左侧历史视图按项目分组展示会话,项目组内是平面列表。

像`superpowers`这类能力会频繁拉起子会话,用户随后在历史里恢复会话时,最常见需求通常不是找到“任意最近会话”,而是快速识别并恢复主会话。平面列表在子会话数量较多时会稀释主会话的可见性。

目标不是把历史列表做成“更像树”,而是只在存在确定父子关系时,把主会话和子会话组织成稳定树结构,降低用户恢复主会话的认知成本。

#### 目标

- 保留当前“按项目分组”的历史视图结构

- 在每个项目组内部,把平面会话列表改成递归树

- 树只基于原始 session 中可确定证明的父子关系建立

- 默认只展开根会话,子会话默认折叠

- 点击任意节点时,仍然打开该节点本身的 replay

- 在不依赖 termcanvas hooks 的前提下工作

- 在用户可能通过其他应用创建会话的前提下工作

#### 非目标

- 不依赖 termcanvas hooks,包括`SubagentStart`和`SubagentStop`

- 不依赖 termcanvas 自己是否发起过`resume`、`fork`、`spawn`

- 不根据时间接近、提示词相似、目录一致性做不确定推断

- 不为了提升树覆盖率而展示“可能正确”的关系边

- 不改变点击历史节点后的现有打开行为

#### 设计原则

- 只接受确定关系。无法确定时,默认视为不存在父子关系

- 宁可漏掉真实子会话,也不允许误挂父子关系

- 父子关系的事实来源必须是原始 session 本身,而不是 termcanvas 的外部观测

- 前端只消费建好的树,不在组件层做父子判断

- 树结构必须稳定,不能因刷新或启发式波动而重排

#### 用户体验概览

历史视图继续保留“项目分组”第一层。

每个项目组内部不再渲染平面 session 行,而是渲染根会话列表。只有确认存在父子关系的节点才会以缩进子节点形式挂在父节点下。没有确定父节点的会话继续作为根节点显示。

默认状态下:

- 项目组可折叠

- 根会话可见

- 子会话默认折叠

- 点击根或子节点,都打开该节点自己的 replay

#### 数据模型

建议把历史数据从平面列表升级为“项目树结果”,由主进程直接产出。

项目级结构:

```ts
interface HistoryProjectTree {
  projectDir: string;
  roots: HistorySessionNode[];
  sessionCount: number;
  rootCount: number;
  latestActivityAt: string;
}
```

节点级结构:

```ts
interface HistorySessionNode {
  sessionId: string;
  provider: "claude" | "codex" | "kimi";
  projectDir: string;
  filePath: string;
  firstPrompt: string;
  startedAt: string;
  lastActivityAt: string;
  treeLastActivityAt: string;
  parentSessionId?: string;
  rootSessionId: string;
  depth: number;
  relationshipSource: "confirmed" | "none";
  hasChildren: boolean;
  childCount: number;
  children: HistorySessionNode[];
}
```

字段约束:

- 根节点的`parentSessionId`为空

- 根节点的`rootSessionId === sessionId`

- 只有`relationshipSource = "confirmed"`的边允许进入树

- 无法确认关系时,`relationshipSource = "none"`

- `treeLastActivityAt`表示该节点整棵子树的最大活动时间

#### 关系建立规则

建树必须发生在主进程 session 索引层,而不是 React 组件层。

允许建边的唯一条件:

- 原始 session 文件中存在明确、稳定、可唯一映射到父会话的来源字段

可接受的字段类型示例:

- `forked_from_id`

- `parent_session_id`

- provider 原生定义且语义稳定的等价父会话字段

不允许建边的情况:

- 仅同项目

- 仅开始时间接近

- 仅首条 prompt 相似

- 仅目录一致

- 存在多个可说得通的父候选

- 需要 termcanvas hooks 或 termcanvas 自身动作才能判断

关系解析流程:

1. 枚举项目相关 session

2. 读取每个 session 的基础元数据和原始关系字段

3. 如果关系字段能唯一指向同项目中的某个父 session,则建立 confirmed 边

4. 否则将该 session 视为根节点

5. 完成整组建树后,统一回填`rootSessionId`、`depth`和`treeLastActivityAt`

#### 一致性约束

- 每个节点最多只有一个父节点

- 不允许跨项目建边

- 不允许形成环

- 不允许一个节点同时出现在根列表和某个父节点的 children 中

- `depth`必须从根沿父链递推

- `treeLastActivityAt`必须等于该节点整棵子树中的最大`lastActivityAt`

- 如果某个 confirmed 父关系违反以上约束,该边必须被丢弃,节点回退为根

#### UI 结构与交互

项目分组保持现有模式:

- 继续显示项目名

- 继续支持项目折叠

- 继续显示项目会话总数

项目内部改为渲染根节点列表。

排序规则:

- 根节点按`treeLastActivityAt`倒序排序

- 同一父节点下的直接子节点按`lastActivityAt`倒序排序

默认展开规则:

- 默认只显示根节点

- 子节点默认折叠

- 展开某节点时,只展开其直接子节点,不递归全展开

节点行建议包含:

- 左侧展开箭头,仅在`hasChildren = true`时显示

- 会话标题,优先显示`firstPrompt`

- 时间信息

- 子树数量提示,例如`childCount`

点击规则:

- 点击根节点,打开该根节点自己的 replay

- 点击子节点,打开该子节点自己的 replay

- 树结构只负责帮助定位,不修改打开目标

#### Show More、Pin、Hide 规则

`show more`规则:

- 只控制“显示多少个根节点”

- 子节点不参与根节点名额计算

- 数据层应按项目拿到完整 session 集合后再建树,展示层只裁剪根节点数量

`pin`规则:

- pin 的单位是整棵根树

- 在子节点上执行 pin 时,实际 pin 到其根节点

- pinned 区展示的是树,不是被拆散的单个子节点

`hide`规则:

- hide 的单位是子树

- 隐藏根节点时,隐藏整棵树

- 隐藏中间子节点时,隐藏该节点及其全部后代

- 不允许出现父节点隐藏但孩子悬空保留在列表中的状态

#### 分页与数据加载策略

现有“先拿一页平面会话,再客户端分组”的模型不适合树结构,因为它可能把父节点和子节点切在不同页。

建议调整为:

- 项目级别保持懒加载

- 某个项目一旦进入历史视图,数据层读取该项目完整 session 集合

- 完整集合在主进程内建树

- 前端只控制显示多少个根节点

这样可以保证:

- 子节点始终跟随父节点出现

- 不会出现“先看到子节点,父节点还没加载”的破碎结构

#### 缓存策略

事实来源永远是原始 session。

允许做缓存,但缓存只是性能优化,删除后必须可以完全重建。

建议缓存 key 至少包含:

- `filePath`

- `mtimeMs`

- `relationSchemaVersion`

缓存内容建议包含:

- session 基础元数据

- 可确定父关系字段的解析结果

- `parentSessionId`

- `rootSessionId`

- `depth`

- `treeLastActivityAt`

缓存失效规则:

- session 文件变化时,对应节点重算

- 关系规则升级时,通过`relationSchemaVersion`整体失效

- 删除缓存后,可从原始 session 重建出相同树结构

#### 错误处理与降级策略

以下情况必须降级为根节点:

- 原始 session 中不存在可唯一定位父节点的字段

- 父字段存在,但父 session 在当前项目历史集合中找不到

- 父字段解析后无法唯一落到一个父 session

- 建边会跨项目

- 建边会形成环

- 节点已存在 confirmed 父节点,又出现另一个冲突父节点

- provider 格式变化导致字段语义不再可信

损坏或不完整数据的处理原则:

- 能读取 session 基础信息时,仍然展示该会话

- 关系解析失败只影响树结构,不影响会话可见性

- replay 可用性不受关系失败影响

- 建树校验失败时做局部回退,不把坏结构发送到前端

#### 测试范围

建议新增或调整以下测试:

- 存在明确父字段时,正确建立递归树

- 不存在父字段时,会话保持为根节点

- 父字段指向不存在的父 session 时,正确降级为根

- 父字段跨项目时,正确降级为根

- 建边成环时,正确降级为根

- 冲突父字段时,正确降级为根

- 根节点按`treeLastActivityAt`排序

- 子节点按`lastActivityAt`排序

- `show more`只作用于根节点

- `pin`按根树工作

- `hide`按子树工作

- 默认折叠状态正确,展开只展开一层

#### 实施边界

建议主要改动边界如下:

- `shared/sessions.ts`

- `electron/session-search-index.ts`

- 左侧历史消费侧,例如`src/components/SessionsPanel.tsx`及相关 history model

职责边界:

- `session-scanner`继续负责发现 session

- `session-search-index`负责提取索引与 confirmed 关系并建树

- renderer 只负责渲染树和维护展开状态

#### 风险与取舍

最大收益:

- 主会话在存在确定父子关系时会更容易识别

- 树结构来源清晰,不依赖 hooks,后续移除 hooks 不会破坏该功能

- 不会因为启发式误挂破坏恢复主会话的体验

主要代价:

- 树覆盖率可能有限

- 一些真实子会话在缺少明确来源字段时仍会显示为根

这是有意选择,因为该设计优先保证“关系正确”而非“覆盖率最大”。
