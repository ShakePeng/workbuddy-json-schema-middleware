import assert from "node:assert";
import test from "node:test";

import { onRequest } from "../responses-json-format.middleware.js";

const schema = {
  type: "object",
  properties: {
    answer: { type: "string" },
  },
  required: ["answer"],
  additionalProperties: false,
};

function context(agent = "codex") {
  return { protocol: "responses", agent };
}

test("json_schema 约束追加到 string input", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    instructions: "Keep the original instructions.",
    input: "Keep the original input.",
    text: {
      format: {
        type: "json_schema",
        name: "ans",
        strict: true,
        schema,
      },
    },
  };

  const result = onRequest(body, context());

  assert.equal(result, body);
  assert.equal(body.instructions, "Keep the original instructions.");
  assert.match(body.input, /Keep the original input\./);
  assert.match(body.input, /exactly one valid JSON value/);
  assert.match(body.input, /Schema name: ans/);
  assert.match(body.input, /"additionalProperties": false/);
});

test("json_object 约束也能追加", () => {
  const body = {
    model: "workbuddy-2/cn:deepseek-v4.1-flash",
    input: "Return an answer.",
    text: { format: { type: "json_object" } },
  };

  onRequest(body, context());

  assert.match(body.input, /one JSON object/);
  assert.match(body.input, /keys are the fields the task asks for/);
  assert.match(body.input, /Do not use Markdown code fences/);
});

test("追加到最后一条 user 消息的 string content", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    input: [
      { role: "user", content: "First question." },
      { role: "assistant", content: "First answer." },
      { role: "user", content: "Latest question." },
    ],
    text: { format: { type: "json_schema", schema } },
  };

  onRequest(body, context());

  assert.equal(body.input[0].content, "First question.");
  assert.equal(body.input[2].content.includes("JSON Schema"), true);
  assert.equal(body.input[2].content.includes("Latest question."), true);
});

test("追加到最后一条 user 消息已有的 input_text", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    input: [
      { role: "developer", content: "Dropped by the upstream." },
      {
        role: "user",
        content: [{ type: "input_text", text: "Latest question." }],
      },
    ],
    text: { format: { type: "json_schema", schema } },
  };

  onRequest(body, context());

  const content = body.input[1].content;
  assert.equal(content.length, 1);
  assert.match(content[0].text, /Latest question\./);
  assert.match(content[0].text, /JSON Schema/);
});

test("user content 没有文本块时新增 input_text", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    input: [
      {
        role: "user",
        content: [{ type: "input_image", image_url: "data:image/png;base64,AA==" }],
      },
    ],
    text: { format: { type: "json_object" } },
  };

  onRequest(body, context());

  assert.equal(body.input[0].content.length, 2);
  assert.equal(body.input[0].content[1].type, "input_text");
  assert.match(body.input[0].content[1].text, /one JSON object/);
});

test("找不到 user 消息时追加一条 user 输入", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    input: [{ role: "developer", content: "Dropped by the upstream." }],
    text: { format: { type: "json_object" } },
  };

  onRequest(body, context());

  assert.equal(body.input.length, 2);
  assert.equal(body.input[1].role, "user");
  assert.match(body.input[1].content, /one JSON object/);
});

test("同一请求重复执行不会重复追加", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    input: [{ role: "user", content: "Existing." }],
    text: { format: { type: "json_schema", schema } },
  };

  onRequest(body, context());
  const once = body.input[0].content;
  onRequest(body, context());

  assert.equal(body.input[0].content, once);
  assert.equal(body.input[0].content.split("magpie-responses-json-format").length, 2);
});

test("非 Responses 请求保持不变", () => {
  const body = {
    model: "cn:glm-5.3",
    text: { format: { type: "json_schema", schema } },
  };
  const before = JSON.stringify(body);

  const result = onRequest(body, { protocol: "chat", agent: "codex" });

  assert.equal(result, undefined);
  assert.equal(JSON.stringify(body), before);
});

test("普通文本请求保持不变", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    input: "Keep the original input.",
    text: { format: { type: "text" } },
  };
  const before = JSON.stringify(body);

  const result = onRequest(body, context());

  assert.equal(result, undefined);
  assert.equal(JSON.stringify(body), before);
});

test("agents 不匹配时跳过", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    text: { format: { type: "json_schema", schema } },
  };

  const result = onRequest(body, { ...context("claude"), options: { agents: ["codex"] } });

  assert.equal(result, undefined);
  assert.equal(body.input, undefined);
});

test("models 前缀匹配时生效", () => {
  const body = {
    model: "workbuddy-2/cn:deepseek-v4.1-flash",
    input: "Return an answer.",
    text: { format: { type: "json_object" } },
  };

  onRequest(body, { ...context(), options: { models: ["workbuddy-2/cn:"] } });

  assert.match(body.input, /one JSON object/);
});

test("models 前缀不匹配时跳过", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    input: "Return an answer.",
    text: { format: { type: "json_object" } },
  };

  const result = onRequest(body, { ...context(), options: { models: ["deepseek/"] } });

  assert.equal(result, undefined);
  assert.equal(body.input, "Return an answer.");
});
