// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Smile AI
// Smile AI — Yunfei video adapter for New API Task Plugin API v1.
// Credentials and prices belong to the gateway configuration, never this file.

const UPSTREAM_MODELS = {
  "gemini-omni-1.1-flash": "omni-flash",
  "veo-3.1-fast-generate-preview": "veo-3.1-fast",
  "veo-3.1-lite-generate-preview": "veo-3.1-lite",
  "veo-3.1-generate-preview": "veo-3.1-quality",
};

export const meta = {
  apiVersion: 1,
  key: "smile-yunfei-veo",
  name: "Smile AI Veo",
  icon: "text:AI",
  description: {
    en: "Smile AI Omni Flash and Veo Fast, Lite and Standard video generation",
    zh: "Smile AI Omni Flash 与 Veo 快速、轻量、标准版视频生成",
  },
  version: "1.0.1",
  author: { name: "Smile AI", url: "https://github.com/7452smile" },
  website: "https://github.com/7452smile/smile-ai-newapi-yunfei-veo",
  baseUrl: "https://img.yunfei.best",
  models: Object.keys(UPSTREAM_MODELS),
  fetchMode: "per_task",
  protocols: ["openai_video"],
  usageSchema: {
    seconds: {
      type: "number",
      unit: "second",
      description: { en: "Video generation unit price", zh: "视频生成单价" },
    },
  },
  usageExamples: [
    { label: "4s · 720p", facts: { seconds: 4 } },
    { label: "6s · 720p", facts: { seconds: 6 } },
    { label: "8s · 720p", facts: { seconds: 8 } },
  ],
};

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be a JSON object");
  }
  return value;
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

// Normalize all aliases before billing, so conflicting fields cannot charge
// one duration while the provider generates another.
function alias(source, names, convert) {
  let chosen;
  for (const name of names) {
    if (!own(source, name)) continue;
    const value = convert(source[name]);
    if (chosen !== undefined && JSON.stringify(chosen) !== JSON.stringify(value)) {
      throw new Error("Conflicting parameters: " + names.join(" / "));
    }
    chosen = value;
  }
  return chosen;
}

function duration(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new Error("duration / seconds must be 4, 6 or 8");
  }
  const seconds = Number(value);
  if (seconds !== 4 && seconds !== 6 && seconds !== 8) {
    throw new Error("duration / seconds must be 4, 6 or 8");
  }
  return seconds;
}

function aspect(value) {
  if (value !== "16:9" && value !== "9:16") throw new Error("aspect_ratio must be 16:9 or 9:16");
  return value;
}

function audio(value) {
  if (typeof value !== "boolean") throw new Error("generate_audio must be a boolean");
  return value;
}

function negativePrompt(value) {
  if (typeof value !== "string") throw new Error("negative_prompt must be a string");
  return value;
}

function image(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Each reference image must be a non-empty string");
  const text = value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(text) && !/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i.test(text) && !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new Error("Reference images must be HTTP(S) URLs, image data URLs or base64 strings");
  }
  return text;
}

const REQUEST_FIELDS = [
  "model", "prompt", "duration", "seconds", "aspect_ratio", "aspectRatio",
  "generate_audio", "generateAudio", "negative_prompt", "negativePrompt",
  "image_url", "image_urls", "image", "images", "input_reference", "size", "resolution",
];

function requestBody(value) {
  const input = object(value, "Request body");
  for (const key of Object.keys(input)) {
    if (!REQUEST_FIELDS.includes(key)) throw new Error("Unsupported video parameter: " + key);
  }
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new Error("prompt is required");
  const seconds = alias(input, ["duration", "seconds"], duration);
  if (seconds === undefined) throw new Error("duration / seconds is required");
  let ratio = alias(input, ["aspect_ratio", "aspectRatio"], aspect);
  if (own(input, "size")) {
    const sizes = { "1280x720": "16:9", "720x1280": "9:16" };
    if (typeof input.size !== "string" || !own(sizes, input.size)) throw new Error("Only 720p sizes 1280x720 and 720x1280 are supported");
    if (ratio !== undefined && ratio !== sizes[input.size]) throw new Error("size conflicts with aspect_ratio");
    ratio = sizes[input.size];
  }
  if (own(input, "resolution") && input.resolution !== "720p") throw new Error("Only 720p resolution is supported");
  const generateAudio = alias(input, ["generate_audio", "generateAudio"], audio);
  const negative = alias(input, ["negative_prompt", "negativePrompt"], negativePrompt);
  const single = alias(input, ["image_url", "image", "input_reference"], image);
  const multiple = alias(input, ["image_urls", "images"], function (values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 2) {
      throw new Error("image_urls must contain one or two images; reference-model mode is not supported");
    }
    return values.map(image);
  });
  if (single !== undefined && multiple !== undefined) throw new Error("Use either image_url or image_urls");
  const output = {
    prompt: input.prompt,
    duration: seconds,
    aspect_ratio: ratio === undefined ? "16:9" : ratio,
    generate_audio: generateAudio === undefined ? true : generateAudio,
  };
  if (negative !== undefined) output.negative_prompt = negative;
  if (single !== undefined) output.image_url = single;
  if (multiple !== undefined) output.image_urls = multiple;
  return output;
}

function upstreamModel(ctx) {
  const name = ctx.upstreamModel || ctx.model;
  if (own(UPSTREAM_MODELS, name)) return UPSTREAM_MODELS[name];
  if (Object.values(UPSTREAM_MODELS).includes(name)) return name;
  throw new Error("The selected model is not supported by the Smile AI Veo plugin");
}

function videosURL(baseUrl) {
  if (typeof baseUrl !== "string" || !/^https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/i.test(baseUrl)) {
    throw new Error("Channel Base URL must be an HTTP(S) API origin without credentials or a query");
  }
  const base = baseUrl.replace(/\/+$/, "");
  if (/\/v1beta$/.test(base)) throw new Error("Use the video API origin, not /v1beta");
  return base + (/\/v1$/.test(base) ? "/videos" : "/v1/videos");
}

function headers(ctx) {
  if (typeof ctx.apiKey !== "string" || !ctx.apiKey.trim()) throw new Error("The channel API key is missing");
  return { Authorization: "Bearer " + ctx.apiKey, "Content-Type": "application/json" };
}

function taskID(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value)) {
    throw new Error("The upstream task id is missing or invalid");
  }
  return value;
}

function videoURL(data) {
  if (!data || typeof data.url !== "string") return "";
  const value = data.url.trim();
  const match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(value);
  if (!match || /[\s\\\x00-\x1f\x7f]/.test(value) || match[1].includes("@")) return "";
  return value;
}

function failureReason(body, apiKey) {
  const error = body && body.error;
  const value = typeof error === "string" ? error : error && error.message;
  let message = typeof value === "string" ? value : body && typeof body.message === "string" ? body.message : "Video generation failed";
  if (typeof apiKey === "string" && apiKey) message = message.split(apiKey).join("[redacted]");
  return message.replace(/[\x00-\x1f\x7f]/g, " ").replace(/sk-[a-z0-9_-]+/gi, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 512);
}

export function buildSubmitRequest(ctx) {
  const body = requestBody(ctx.requestBody);
  body.model = upstreamModel(ctx);
  return {
    url: videosURL(ctx.baseUrl), method: "POST", headers: headers(ctx), body: body,
    action: body.image_url || body.image_urls ? "image_to_video" : "text_to_video",
  };
}

export function extractUsage(ctx) {
  upstreamModel(ctx);
  return { seconds: requestBody(ctx.requestBody).duration };
}

export function parseSubmitResponse(ctx, response) {
  const body = object(response.body, "Upstream response");
  const id = taskID(body.id || body.task_id);
  const result = {
    taskId: id,
    taskData: { id: id, status: typeof body.status === "string" ? body.status : "queued" },
  };
  const parsed = parseTaskResult(ctx, body);
  if (parsed.status === "SUCCESS" || parsed.status === "FAILURE") {
    result.immediate = parsed;
    if (parsed.status === "SUCCESS") result.taskData.url = videoURL(body);
    else result.taskData.error = { message: parsed.reason };
    for (const key of ["duration", "seconds"]) {
      if (own(body, key)) result.taskData[key] = body[key];
    }
  }
  return result;
}

export function buildQueryRequest(ctx) {
  return { url: videosURL(ctx.baseUrl) + "/" + encodeURIComponent(taskID(ctx.taskId)), method: "GET", headers: headers(ctx) };
}

export function parseTaskResult(ctx, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "UNKNOWN", reason: "Invalid upstream task response" };
  const statuses = { queued: "QUEUED", pending: "QUEUED", in_progress: "IN_PROGRESS", processing: "IN_PROGRESS", completed: "SUCCESS", failed: "FAILURE", cancelled: "FAILURE" };
  const status = typeof body.status === "string" && own(statuses, body.status) ? statuses[body.status] : "UNKNOWN";
  if (status === "UNKNOWN") return { status: status, reason: "Unrecognized upstream task status" };
  if (status === "FAILURE") return { status: status, progress: "100%", reason: failureReason(body, ctx && ctx.apiKey) };
  if (status === "SUCCESS") {
    const url = videoURL(body);
    if (!url) return { status: "UNKNOWN", reason: "Completed task has no valid HTTP(S) video URL" };
    return { status: status, progress: "100%", remoteUrl: url };
  }
  const result = { status: status };
  const progress = typeof body.progress === "number" || typeof body.progress === "string" ? Number(body.progress) : NaN;
  if (Number.isFinite(progress) && progress >= 0 && progress < 100) result.progress = Math.floor(progress) + "%";
  return result;
}

// No reported duration means keep the frozen submission usage, not zero.
export function extractUsageOnComplete(ctx, result, body) {
  if (result.status !== "SUCCESS" || !body || typeof body !== "object") return {};
  const seconds = alias(body, ["duration", "seconds"], duration);
  return seconds === undefined ? {} : { seconds: seconds };
}

export function listArtifacts(task) {
  return task.status === "SUCCESS" && videoURL(task.data) ? [{ key: "video", type: "video", mimeType: "video/mp4" }] : [];
}

export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("artifact_not_found");
  const url = videoURL(ctx.data);
  if (!url) throw new Error("artifact_not_found");
  const method = ctx.clientRequest && ctx.clientRequest.method ? ctx.clientRequest.method.toUpperCase() : "GET";
  if (method !== "GET" && method !== "HEAD") throw new Error("Video content only supports GET and HEAD");
  // The provider returns a public/signed CDN URL. Never send its API key there.
  return { url: url, method: method, credentialless: true };
}

export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("Use a JSON request; local images must be encoded as data URLs");
      if (!own(UPSTREAM_MODELS, ctx.model)) throw new Error("Use one of this plugin's four public model names");
      const body = requestBody(ctx.body.value);
      body.model = ctx.model;
      return { kind: "submit", model: ctx.model, action: body.image_url || body.image_urls ? "image_to_video" : "text_to_video", requestBody: body };
    },
    render: function (ctx, task) {
      const statuses = { NOT_START: "queued", SUBMITTED: "queued", QUEUED: "queued", IN_PROGRESS: "in_progress", SUCCESS: "completed", FAILURE: "failed" };
      const output = { id: task.task_id, status: statuses[task.status] || "unknown" };
      if (task.status === "SUCCESS" && videoURL(task.data)) output.url = videoURL(task.data);
      if (task.status === "FAILURE") output.error = { code: "video_generation_failed", message: failureReason({ message: task.fail_reason || "Video generation failed" }) };
      return output;
    },
  },
};
