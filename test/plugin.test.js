import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import * as plugin from "../plugin.js";

const pairs = [
  ["gemini-omni-1.1-flash", "omni-flash"],
  ["veo-3.1-fast-generate-preview", "veo-3.1-fast"],
  ["veo-3.1-lite-generate-preview", "veo-3.1-lite"],
  ["veo-3.1-generate-preview", "veo-3.1-quality"],
];
const publicModel = pairs[1][0];
const input = (changes = {}) => ({ model: publicModel, prompt: "A paper boat on a pond", duration: 8, ...changes });
function decode(body, model = body.model) {
  return plugin.protocols.openai_video.decodeRequest({ model, body: { kind: "json", value: body } });
}
function context(body, changes = {}) {
  const intent = decode(body);
  return { model: intent.model, upstreamModel: intent.model, requestBody: intent.requestBody, baseUrl: "https://video.example", apiKey: "fixture-only", ...changes };
}

test("all four public models use the confirmed Yunfei names and exact requested seconds", () => {
  assert.deepEqual(plugin.meta.models, pairs.map(([model]) => model));
  for (const [model, upstream] of pairs) {
    for (const seconds of [4, 6, 8]) {
      const ctx = context(input({ model, duration: seconds }));
      const descriptor = plugin.buildSubmitRequest(ctx);
      assert.equal(descriptor.url, "https://video.example/v1/videos");
      assert.equal(descriptor.method, "POST");
      assert.equal(descriptor.headers.Authorization, "Bearer fixture-only");
      assert.equal(descriptor.body.model, upstream);
      assert.equal(descriptor.body.duration, seconds);
      assert.equal(descriptor.action, "text_to_video");
      assert.equal(descriptor.model, undefined, "do not overwrite the host's pinned client model");
      assert.deepEqual(plugin.extractUsage(ctx), { seconds });
      assert.equal(descriptor.body.instances, undefined);
      assert.equal(descriptor.body.parameters, undefined);
    }
    assert.equal(plugin.buildSubmitRequest(context(input({ model }), { upstreamModel: upstream })).body.model, upstream);
  }
});

test("decoding is repeatable and does not mutate host request objects", () => {
  const request = input({ image_urls: ["https://images.example/a.png", "https://images.example/b.png"] });
  const original = structuredClone(request);
  const first = decode(request);
  assert.deepEqual(first, decode(request));
  assert.deepEqual(request, original);
  first.requestBody.image_urls.push("https://images.example/another.png");
  assert.deepEqual(request, original);
});

test("duration aliases agree and explicit false audio is preserved", () => {
  const request = input({ duration: "6", seconds: 6, generateAudio: false, generate_audio: false, negativePrompt: "" });
  const body = plugin.buildSubmitRequest(context(request)).body;
  assert.equal(body.duration, 6);
  assert.equal(body.generate_audio, false);
  assert.equal(body.negative_prompt, "");
  assert.equal(body.seconds, undefined);
  assert.equal(body.generateAudio, undefined);
  const secondsOnly = input({ seconds: "4" });
  delete secondsOnly.duration;
  assert.equal(plugin.extractUsage(context(secondsOnly)).seconds, 4);
  assert.equal(plugin.buildSubmitRequest(context(input())).body.generate_audio, true);
});

test("invalid and conflicting billing quantities are rejected before submission", () => {
  for (const value of [undefined, null, true, false, [], [8], {}, "", " ", 0, -4, 3, 4.5, 10, 3601, Infinity, NaN, 18446744073686646000, "Infinity"]) {
    assert.throws(() => decode(input({ duration: value })), /duration/);
    assert.throws(() => plugin.extractUsage({ model: publicModel, requestBody: input({ duration: value }) }), /duration/);
  }
  assert.throws(() => decode(input({ duration: 4, seconds: 8 })), /Conflicting/);
  const missing = input(); delete missing.duration;
  assert.throws(() => decode(missing), /required/);
  for (const changes of [{ parameters: { duration: 8 } }, { metadata: { duration: 8 } }, { n: 2 }, { sampleCount: 2 }, { unknown: true }]) {
    assert.throws(() => decode(input(changes)), /Unsupported video parameter/);
  }
});

test("unsupported model, request shapes and empty prompts fail explicitly", () => {
  for (const prompt of ["", "  ", 123, null, []]) assert.throws(() => decode(input({ prompt })), /prompt/);
  for (const value of [null, [], "text"]) assert.throws(() => decode(value, publicModel), /JSON object/);
  assert.throws(() => decode(input({ model: "veo-3.1-generate-preview-ref" })), /four public model/);
  assert.throws(() => plugin.buildSubmitRequest(context(input(), { upstreamModel: "other-model" })), /not supported/);
  assert.throws(() => plugin.protocols.openai_video.decodeRequest({ model: publicModel, body: { kind: "multipart" } }), /JSON request/);
});

test("720p aspect, audio and negative prompt aliases are validated", () => {
  assert.equal(plugin.buildSubmitRequest(context(input())).body.aspect_ratio, "16:9");
  assert.equal(plugin.buildSubmitRequest(context(input({ size: "720x1280" }))).body.aspect_ratio, "9:16");
  assert.equal(plugin.buildSubmitRequest(context(input({ aspectRatio: "9:16", resolution: "720p" }))).body.aspect_ratio, "9:16");
  for (const bad of [
    { aspect_ratio: "1:1" }, { aspect_ratio: "16:9", aspectRatio: "9:16" },
    { size: "720x1280", aspect_ratio: "16:9" }, { size: "1920x1080" }, { size: ["1280x720"] },
    { resolution: "1080p" }, { resolution: "4k" }, { generate_audio: "false" },
    { generate_audio: true, generateAudio: false }, { negative_prompt: 5 },
    { negative_prompt: "a", negativePrompt: "b" },
  ]) assert.throws(() => decode(input(bad)));
});

test("single images and first/last frames preserve the documented JSON format", () => {
  for (const value of ["https://images.example/first.jpg", "data:image/png;base64,aGVsbG8=", "aGVsbG8="]) {
    for (const field of ["image_url", "image", "input_reference"]) {
      const descriptor = plugin.buildSubmitRequest(context(input({ [field]: value })));
      assert.equal(descriptor.body.image_url, value);
      assert.equal(descriptor.action, "image_to_video");
    }
  }
  const frames = ["https://images.example/first.jpg", "https://images.example/last.jpg"];
  assert.deepEqual(plugin.buildSubmitRequest(context(input({ images: frames }))).body.image_urls, frames);
  for (const bad of [
    { image_url: {} }, { image_url: "" }, { image_url: "file:///secret" },
    { image_urls: [] }, { image_urls: frames.concat(frames) }, { image_urls: "not-an-array" },
    { image_url: frames[0], image_urls: frames }, { image: frames[0], input_reference: frames[1] },
  ]) assert.throws(() => decode(input(bad)));
});

test("base URLs support an optional v1 suffix and reject incorrect origins", () => {
  for (const baseUrl of ["https://video.example", "https://video.example/", "https://video.example/v1", "https://video.example/v1/"]) {
    assert.equal(plugin.buildSubmitRequest(context(input(), { baseUrl })).url, "https://video.example/v1/videos");
  }
  for (const baseUrl of ["https://video.example/v1beta", "https://video.example?key=fixture", "https://user:pass@video.example", "file:///tmp/test", ""]) {
    assert.throws(() => plugin.buildSubmitRequest(context(input(), { baseUrl })));
  }
  assert.throws(() => plugin.buildSubmitRequest(context(input(), { apiKey: "" })), /key is missing/);
});

test("submission handles queued, immediate success and immediate failure", () => {
  const ctx = context(input());
  assert.deepEqual(plugin.parseSubmitResponse(ctx, { body: { id: "job-1", status: "queued" } }), {
    taskId: "job-1", taskData: { id: "job-1", status: "queued" },
  });
  const completed = plugin.parseSubmitResponse(ctx, { body: { id: "job-2", status: "completed", url: "https://cdn.example/video.mp4", duration: 8, private: "not-public" } });
  assert.equal(completed.immediate.status, "SUCCESS");
  assert.equal(completed.taskData.url, "https://cdn.example/video.mp4");
  assert.equal(completed.taskData.private, undefined);
  const failed = plugin.parseSubmitResponse(ctx, { body: { id: "job-3", status: "failed", error: { message: "Provider rejected the request" } } });
  assert.equal(failed.immediate.status, "FAILURE");
  for (const id of [undefined, "", "..", "../another", "job?id=1", "job/another", "job\nheader", "x".repeat(257)]) {
    assert.throws(() => plugin.parseSubmitResponse(ctx, { body: { id, status: "queued" } }), /task id/);
  }
});

test("poll requests use the upstream id and have no charge-producing body", () => {
  const descriptor = plugin.buildQueryRequest({ baseUrl: "https://video.example", taskId: "job:123", publicTaskId: "task_public", apiKey: "fixture-only" });
  assert.equal(descriptor.url, "https://video.example/v1/videos/job%3A123");
  assert.equal(descriptor.method, "GET");
  assert.equal(descriptor.body, undefined);
});

test("polling recognizes lifecycle states and does not mistake malformed responses for running jobs", () => {
  const expected = { queued: "QUEUED", pending: "QUEUED", processing: "IN_PROGRESS", in_progress: "IN_PROGRESS", failed: "FAILURE", cancelled: "FAILURE" };
  for (const [status, normalized] of Object.entries(expected)) assert.equal(plugin.parseTaskResult({}, { status }).status, normalized);
  assert.deepEqual(plugin.parseTaskResult({}, { status: "completed", url: "https://cdn.example/v.mp4" }), { status: "SUCCESS", progress: "100%", remoteUrl: "https://cdn.example/v.mp4" });
  for (const body of [null, [], {}, { status: "other" }, { status: ["queued"] }, { status: "completed" }, { status: "completed", url: "javascript:alert(1)" }]) {
    assert.equal(plugin.parseTaskResult({}, body).status, "UNKNOWN");
  }
  assert.equal(plugin.parseTaskResult({}, { status: "in_progress", progress: 42.9 }).progress, "42%");
  assert.equal(plugin.parseTaskResult({}, { status: "in_progress", progress: 1000 }).progress, undefined);
});

test("completion keeps estimated seconds when upstream omits usage and rejects corrupt measurements", () => {
  assert.deepEqual(plugin.extractUsageOnComplete({}, { status: "SUCCESS" }, { status: "completed" }), {});
  assert.deepEqual(plugin.extractUsageOnComplete({}, { status: "SUCCESS" }, { seconds: "6", duration: 6 }), { seconds: 6 });
  assert.deepEqual(plugin.extractUsageOnComplete({}, { status: "FAILURE" }, { duration: 0 }), {});
  for (const body of [{ seconds: 0 }, { duration: -1 }, { seconds: 1e30 }, { duration: 4, seconds: 8 }]) {
    assert.throws(() => plugin.extractUsageOnComplete({}, { status: "SUCCESS" }, body));
  }
});

test("public results preserve script-compatible url and never return the private task envelope", () => {
  const task = { task_id: "task_public", status: "SUCCESS", data: { id: "provider_private", url: "https://cdn.example/v.mp4", api_key: "fixture-secret", arbitrary: "private" } };
  assert.deepEqual(plugin.protocols.openai_video.render({}, task), { id: "task_public", status: "completed", url: "https://cdn.example/v.mp4" });
  const result = plugin.protocols.openai_video.render({}, { ...task, status: "FAILURE", fail_reason: "bad request" });
  assert.equal(result.url, undefined);
  assert.equal(result.error.code, "video_generation_failed");
  assert.equal(result.error.message, "bad request");
});

test("CDN downloads are credentialless and unsafe URL forms are rejected", () => {
  const task = { status: "SUCCESS", data: { url: "https://cdn.example/video.mp4?signature=fixture" } };
  assert.deepEqual(plugin.listArtifacts(task), [{ key: "video", type: "video", mimeType: "video/mp4" }]);
  for (const method of ["GET", "HEAD"]) {
    assert.deepEqual(plugin.buildContentRequest({ ...task, artifactKey: "video", apiKey: "fixture-secret", clientRequest: { method, headers: { Authorization: "Bearer fixture" } } }), {
      url: task.data.url, method, credentialless: true,
    });
  }
  for (const url of ["/relative.mp4", "file:///secret", "https://key@cdn.example/v.mp4", "https://cdn.example/\nheader", "https://cdn.example\\evil/v.mp4"]) {
    assert.deepEqual(plugin.listArtifacts({ status: "SUCCESS", data: { url } }), []);
    assert.throws(() => plugin.buildContentRequest({ artifactKey: "video", data: { url } }), /artifact_not_found/);
  }
  assert.throws(() => plugin.buildContentRequest({ ...task, artifactKey: "audio" }), /artifact_not_found/);
  assert.throws(() => plugin.buildContentRequest({ ...task, artifactKey: "video", clientRequest: { method: "POST" } }), /GET and HEAD/);
});

test("provider failures do not echo obvious credentials", () => {
  const result = plugin.parseTaskResult({}, { status: "failed", error: { message: "bad sk-fixture-value and Bearer fixture-value\nagain" } });
  assert.equal(result.reason, "bad [redacted] and Bearer [redacted] again");
  const custom = plugin.parseTaskResult({ apiKey: "arbitrary-fixture-key" }, { status: "failed", message: "Rejected arbitrary-fixture-key" });
  assert.equal(custom.reason, "Rejected [redacted]");
});

test("four-model HTTP contract: submit, poll, return URL and download without leaking authorization", async (t) => {
  const jobs = new Map();
  const errors = [];
  let origin;
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/v1/videos") {
        assert.equal(request.headers.authorization, "Bearer fixture-only");
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        assert.ok(pairs.some(([, upstream]) => upstream === body.model));
        assert.equal(body.duration, 8);
        assert.equal(body.generate_audio, false);
        assert.equal(body.instances, undefined);
        const id = "job-" + jobs.size;
        jobs.set(id, { calls: 0, body });
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ id, status: "queued" }));
      } else if (request.method === "GET" && request.url.startsWith("/v1/videos/")) {
        assert.equal(request.headers.authorization, "Bearer fixture-only");
        const id = request.url.split("/").pop();
        const job = jobs.get(id);
        assert.ok(job);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(job.calls++ === 0 ? { id, status: "in_progress", progress: 30 } : { id, status: "completed", url: origin + "/media/" + id + ".mp4" }));
      } else if (request.url.startsWith("/media/")) {
        assert.equal(request.headers.authorization, undefined);
        response.setHeader("Content-Type", "video/mp4");
        response.end("fixture-video-bytes");
      } else throw new Error("Unexpected request path: " + request.url);
    } catch (error) {
      errors.push(error); response.statusCode = 500; response.end("mock contract failure");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = "http://127.0.0.1:" + server.address().port;
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const [model] of pairs) {
    const ctx = context(input({ model, generate_audio: false }), { baseUrl: origin });
    const submit = plugin.buildSubmitRequest(ctx);
    const upstream = await fetch(submit.url, { method: submit.method, headers: submit.headers, body: JSON.stringify(submit.body) });
    assert.equal(upstream.status, 200);
    const accepted = plugin.parseSubmitResponse(ctx, { body: await upstream.json(), statusCode: 200 });
    const query = plugin.buildQueryRequest({ ...ctx, taskId: accepted.taskId });
    const running = await (await fetch(query.url, { headers: query.headers })).json();
    assert.equal(plugin.parseTaskResult({}, running).status, "IN_PROGRESS");
    const completed = await (await fetch(query.url, { headers: query.headers })).json();
    const outcome = plugin.parseTaskResult({}, completed);
    assert.equal(outcome.status, "SUCCESS");
    assert.deepEqual(plugin.extractUsageOnComplete({}, outcome, completed), {});
    const task = { task_id: "task_public_" + accepted.taskId, status: outcome.status, data: completed };
    assert.equal(plugin.protocols.openai_video.render({}, task).url, completed.url);
    const content = plugin.buildContentRequest({ ...ctx, ...task, artifactKey: "video", clientRequest: { method: "GET" } });
    assert.equal(await (await fetch(content.url, { method: content.method })).text(), "fixture-video-bytes");
  }
  assert.equal(jobs.size, 4);
  assert.deepEqual(errors, []);
});
