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

test("json_schema 约束追加到 string instructions", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    instructions: "Keep the original instructions.",
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
  assert.match(body.instructions, /Keep the original instructions\./);
  assert.match(body.instructions, /exactly one valid JSON value/);
  assert.match(body.instructions, /Schema name: ans/);
  assert.match(body.instructions, /"additionalProperties": false/);
});

test("json_object 约束也能追加", () => {
  const body = {
    model: "workbuddy-2/cn:deepseek-v4.1-flash",
    text: { format: { type: "json_object" } },
  };

  onRequest(body, context());

  assert.match(body.instructions, /one JSON object/);
  assert.match(body.instructions, /keys are the fields the task asks for/);
  assert.match(body.instructions, /Do not use Markdown code fences/);
});

test("instructions 是数组时追加文本块", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    instructions: [{ type: "input_text", text: "Existing." }],
    text: { format: { type: "json_schema", schema } },
  };

  onRequest(body, context());

  assert.equal(body.instructions.length, 2);
  assert.match(body.instructions[1].text, /JSON Schema/);
});

test("同一请求重复执行不会重复追加", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    instructions: "Existing.",
    text: { format: { type: "json_schema", schema } },
  };

  onRequest(body, context());
  const once = body.instructions;
  onRequest(body, context());

  assert.equal(body.instructions, once);
  assert.equal(body.instructions.split("magpie-responses-json-format").length, 2);
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
  const body = { model: "workbuddy-2/cn:glm-5.3", text: { format: { type: "text" } } };
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
  assert.equal(body.instructions, undefined);
});

test("models 前缀匹配时生效", () => {
  const body = {
    model: "workbuddy-2/cn:deepseek-v4.1-flash",
    text: { format: { type: "json_object" } },
  };

  onRequest(body, { ...context(), options: { models: ["workbuddy-2/cn:"] } });

  assert.match(body.instructions, /one JSON object/);
});

test("models 前缀不匹配时跳过", () => {
  const body = {
    model: "workbuddy-2/cn:glm-5.3",
    text: { format: { type: "json_object" } },
  };

  const result = onRequest(body, { ...context(), options: { models: ["deepseek/"] } });

  assert.equal(result, undefined);
  assert.equal(body.instructions, undefined);
});
