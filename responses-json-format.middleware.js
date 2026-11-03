// Responses API 的 text.format 在中转层可能被丢弃。部分上游还会丢弃
// instructions/system 消息，因此这里把 JSON 约束放进最后一条 user 输入。

const MARKER = "<!-- magpie-responses-json-format -->";

export function onRequest(body, ctx) {
  if (!body || typeof body != "object" || Array.isArray(body)) return;
  if (ctx.protocol != "responses") return;
  const options = ctx.options || {};
  if (!appliesTo(body, ctx, options)) return;

  const text = body.text;
  const format = text && typeof text == "object" ? text.format : undefined;
  if (!format || typeof format != "object") return;

  const instruction = buildInstruction(format);
  if (!instruction) return;

  body.input = appendToLastUserInput(body.input, instruction);
  return body;
}

function appliesTo(body, ctx, options) {
  const agents = Array.isArray(options.agents) ? options.agents : [];
  if (agents.length && !agents.includes(String(ctx.agent || ""))) return false;

  const models = Array.isArray(options.models) ? options.models : [];
  if (!models.length) return true;
  const model = String(body.model || ctx.model || "");
  return models.some((prefix) => typeof prefix == "string" && model.startsWith(prefix));
}

function buildInstruction(format) {
  const type = String(format.type || "");
  if (type != "json_schema" && type != "json_object") return;

  const lines = [
    MARKER,
    "You must return exactly one valid JSON value and nothing else.",
    "Do not use Markdown code fences, headings, explanations, or any text before or after the JSON.",
    "Every required property must be present, and undeclared properties must be omitted when the schema forbids them.",
  ];

  if (type == "json_object") {
    lines.push(
      "The response must be one JSON object whose keys are the fields the task asks for; do not wrap the answer in an extra field or return a bare string.",
    );
    return lines.join("\n");
  }

  lines.push("The JSON value must conform to this JSON Schema:");
  if (format.name) lines.push(`Schema name: ${String(format.name)}`);
  lines.push(JSON.stringify(format.schema || {}, null, 2));
  return lines.join("\n");
}

function appendToLastUserInput(input, addition) {
  if (typeof input == "string") {
    if (input.includes(MARKER)) return input;
    return input ? input + "\n\n" + addition : addition;
  }
  if (!Array.isArray(input)) {
    return [{ role: "user", content: addition }];
  }

  for (let index = input.length - 1; index >= 0; index--) {
    const item = input[index];
    if (!item || item.role != "user") continue;
    if (JSON.stringify(item).includes(MARKER)) return input;
    item.content = appendToContent(item.content, addition);
    return input;
  }

  return [...input, { role: "user", content: addition }];
}

function appendToContent(current, addition) {
  if (typeof current == "string") {
    if (current.includes(MARKER)) return current;
    return current ? current + "\n\n" + addition : addition;
  }
  if (Array.isArray(current)) {
    if (current.some((part) => JSON.stringify(part).includes(MARKER))) return current;
    const lastText = current[current.length - 1];
    if (lastText && lastText.type == "input_text" && typeof lastText.text == "string") {
      lastText.text = lastText.text ? lastText.text + "\n\n" + addition : addition;
      return current;
    }
    return [...current, { type: "input_text", text: addition }];
  }
  if (current && typeof current == "object") {
    return [current, { type: "input_text", text: addition }];
  }
  return addition;
}
