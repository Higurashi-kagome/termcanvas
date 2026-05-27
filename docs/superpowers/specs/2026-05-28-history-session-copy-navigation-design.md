### History Session Copy And Prompt Navigation Design

### Goal

历史 session 详情页应支持像普通文档一样拖选并复制内容，同时保留长会话中的快速跳转能力。

当前`SessionReplayView`把多类正文内容包在整块`button`中，用点击正文触发`seekTo(index)`。这个交互的视觉反馈很弱，也会干扰用户拖选 prompt、回复和工具输出。新设计将“阅读/选择复制”和“跳转导航”拆开。

### Scope

本设计覆盖：

- 历史 session replay drawer 的详情正文。

- 用户 prompt、assistant 回复、错误文本、展开后的工具 input/output 的文本选择。

- 基于用户 prompt 的右侧悬浮导航和窄布局按钮导航。

本设计不覆盖：

- session 文件扫描、索引、IPC 或 replay timeline 数据结构。

- 历史列表分组、隐藏、置顶和 worktree 归属逻辑。

- 新增全文搜索或跨 session 导航。

### Recommended Approach

采用“正文可选择 + prompt 导航独立组件”的方案。

正文区域不再承担点击 seek。用户 prompt、assistant 回复和错误行改为普通可选择容器；复制按钮、fork 菜单、resume 按钮、working fold 和 tool fold 仍使用按钮。

新增 replay 内部组件`PromptJumpNav`，只负责展示用户 prompt 索引和发起滚动跳转。宽布局参考 DeepSeek 对话索引效果：默认右侧贴边显示轻量刻度，hover 后展开 prompt 列表；窄布局改为 header 图标按钮打开 popover。

放弃正文点击 seek 的原因：

- 当前点击后主要只更新`replayCurrentIndex`并滚动 current ref，几乎没有可感知反馈。

- 正文作为按钮会破坏文本选择这个更高频、更符合详情页阅读场景的行为。

- 把跳转放入显式 prompt 导航后，功能更可发现，边界也更清楚。

### Architecture

主要修改集中在`src/components/SessionReplayView.tsx`。

保留现有流程：

- `timeline`从`useSessionStore`读取。

- `buildTurns(timeline.events)`继续负责把 timeline 分成 turn。

- `determineFoldSplit()`继续决定 working fold 和 final answer。

新增边界：

- `PromptJumpNav`接收 prompt 列表、当前 prompt id、跳转回调和布局状态。

- `UserPrompt`、`AssistantTextRow`、`ThinkingRow`、`ErrorRow`的正文部分不再是整块`button`。

- tool group 和 working fold 的折叠头继续是按钮；展开后的`pre`文本可选择。

建议的本地类型：

```ts
interface PromptJumpItem {
  id: string;
  eventIndex: number;
  turnIndex: number;
  text: string;
  timestamp: string;
}

type PromptNavMode = "rail" | "railCompact" | "button";
```

### Layout

`SessionReplayView`整体仍是上下结构：顶部`TopicHeader`，下方正文滚动区。

导航层不改变正文最大宽度，也不挤压正文布局。

- 宽布局：右侧贴边显示 prompt 刻度，hover 展开浮层列表。

- 中等布局：保留贴边刻度，浮层宽度收敛并向左展开。

- 窄布局：隐藏贴边刻度，在`TopicHeader`右侧加入目录图标按钮，点击打开 prompt popover。

布局判断应基于 replay drawer 或正文容器宽度，而不是全局窗口宽度。原因是`SessionsOverlay`宽度受左面板、右面板、task drawer 和 expanded 状态共同影响。

建议阈值由实现时按现有视觉密度微调：

- `rail`：容器宽度足够展示正文和 300px 左展开浮层。

- `railCompact`：容器宽度不足以舒适展示大浮层，但仍适合右侧刻度。

- `button`：容器较窄，贴边 hover 容易误触或遮挡正文。

### Data Flow

从`turns`派生`promptItems`：

- 跳过没有`userEvent`的 headless turn。

- `id`使用稳定值，如`prompt-${turn.userEvent.index}`。

- `eventIndex`保留 timeline index，用于同步`seekTo(eventIndex)`。

- `turnIndex`按用户 prompt 顺序递增。

- `text`使用`turn.userEvent.textPreview`。

渲染每个`UserPrompt`时：

- 设置`id`或 ref。

- 注册到 prompt ref map。

- 正文区域允许文本选择。

导航点击某项时：

- 找到对应 DOM 节点。

- 调用`scrollIntoView({ block: "start", behavior: "smooth" })`。

- 调用`seekTo(eventIndex)`同步现有 replay 状态。

- 设置短暂`highlightedPromptId`，让目标 prompt 有 1 到 1.5 秒轻微提示。

滚动联动：

- 使用`IntersectionObserver`观察用户 prompt 节点，更新`activePromptId`。

- 如果环境不支持 observer，退化为只在点击导航后更新 active。

### Interaction Details

正文选择：

- 用户可以从任意 prompt、回复、错误文本、展开的工具 input/output 中拖选文本。

- 拖选不触发跳转、折叠或 current index 变化。

- 原有单条复制按钮继续保留。

Prompt rail：

- 默认只显示一列淡刻度。

- 当前 prompt 刻度更深或使用 accent 色。

- hover rail 区域时显示浮层列表。

- 列表项单行省略，hover 显示更明显背景。

- 点击列表项跳转并高亮正文 prompt。

Header button：

- 窄布局时在`TopicHeader`操作区显示目录按钮。

- 点击打开 popover。

- 选择 prompt 后跳转并关闭 popover。

- popover 最大宽度不超过抽屉可用宽度。

现有操作：

- Back、Resume、resume command copy、reply copy、prompt copy、fork 菜单保留。

- Working fold 和 tool fold 仍由其折叠头按钮控制。

- 正文整行点击 seek 移除。

### Edge Cases

没有用户 prompt：

- 不显示 prompt 导航。

- 正文仍可选择复制。

只有一个用户 prompt：

- 默认隐藏 prompt 导航，避免无意义控件。

- 如实现复杂度更低，也可以显示 header 按钮但 disabled；推荐隐藏。

大量 prompt：

- 浮层和 popover 内部滚动。

- 当前项自动滚入可见范围。

- 列表项使用固定或近似固定高度，避免滚动时布局跳动。

超长 prompt：

- 导航列表单行省略。

- 正文按现有 markdown 规则换行展示。

- tooltip 可显示较长预览，但不要求显示完整 prompt。

抽屉宽度变化：

- resize 后重新计算 nav mode。

- popover 应避免超出 drawer 边界。

### Accessibility

- Prompt 导航项使用`button`。

- 每项有明确`aria-label`，例如`Jump to prompt 3`。

- Header 目录按钮有 title 和 aria-label。

- Popover 支持键盘 focus；Enter 或 Space 触发跳转。

- rail 刻度可作为按钮或包含可访问标签，但视觉上保持轻量。

### Testing

单元测试：

- 从 turns 派生 prompt items 时跳过 headless turn。

- prompt item 保留正确`eventIndex`、顺序和文本。

React/jsdom 测试：

- 用户 prompt 和 assistant 回复正文不再渲染为整块`button`。

- prompt 导航项点击会调用`seekTo(eventIndex)`并触发目标节点滚动。

- 窄布局显示 header 按钮，宽布局显示 rail。

回归测试：

- prompt copy、reply copy 按钮仍存在。

- fork 菜单仍存在并可点击。

- working fold 和 tool fold 折叠按钮仍存在并可切换。

- 没有 prompt 或只有一个 prompt 时不显示无意义导航。

### Implementation Notes

实现阶段优先保持改动小：

- 先拆出 prompt item 派生 helper，便于测试。

- 再把正文外层`button`替换为普通容器，保留内部视觉样式。

- 最后加入`PromptJumpNav`及响应式模式。

不需要修改 Electron main/preload、shared session 类型或历史扫描逻辑。
