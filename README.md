# WorkBuddy Responses JSON Format

Magpie 网关中间件，用于绕过 workbuddy-manager 丢失 Responses `text.format` 的问题（[issue #258](https://github.com/ithtelab/workbuddy-manager/issues/258)）。

当 `/v1/responses` 请求带有 `text.format` 时，插件把 `json_schema` 或 `json_object` 约束追加到最后一条 `user` 输入。它不依赖上游不支持的 `response_format`，也绕开会被部分中转层整段丢弃的 `instructions/system` 通道，适用于 Codex 的 guardian 自动审批、标题生成和 memory 提取。

## 行为

- 只处理 Responses API，不改动 Chat、Anthropic 和 Gemini 请求。
- 支持 `text.format.type = "json_schema"` 和 `"json_object"`。
- 保留原有输入和 `instructions`，只修改最后一条 `user` 输入的文本。
- 找不到 `user` 输入时，在输入末尾追加一条包含 JSON 约束的 `user` 消息。
- 不修改模型、流式参数、工具定义或工具选择。
- 同一请求重复执行不会重复追加。

## 选项

```json
{
  "agents": ["codex"],
  "models": []
}
```

- `agents`：仅对指定 agent 生效，留空表示全部。
- `models`：按模型名前缀过滤，例如 `["workbuddy-2/cn:"]`，留空表示全部。
- 本机已保存 `{"agents":["codex"],"models":[]}`。
- 不保存 options 时插件也会生效，默认处理所有 agent 和模型。

## 验证

```sh
yarn test
```

测试覆盖 string/array 形式的 `input`、文本块形式的 `content`、缺少 user 消息、重复执行、agent/model 过滤和无关请求透传。

已通过上游实际请求验证：

- `deepseek-v4.1-flash` + `json_schema`，连续 3 次返回合法 JSON
- `cn:deepseek-v4.1-flash` + `json_schema`，连续 3 次返回合法 JSON

## 限制

这个插件是提示词降级方案，不能保证任意模型 100% 遵守 schema。插件不会改写回复内容，也不会从回复中剥离 Markdown 代码围栏；如果某个模型仍返回带围栏的文本，需要在网关层继续做响应清洗。
