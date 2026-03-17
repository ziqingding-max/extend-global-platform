import { getDb } from "../db";
import { type InvokeParams, type InvokeResult } from "../_core/llm";
import { aiTaskExecutions } from "../../drizzle/schema";

export type AITask = "knowledge_summarize" | "source_authority_review" | "vendor_bill_parse" | "invoice_audit" | "knowledge_generate_guide";
export type AIProvider = "qwen";

function resolveEnvKey(name: string): string {
  return process.env[name] ?? "";
}

function extractTokenUsage(result: InvokeResult): { inputTokens: number; outputTokens: number } {
  const usage = (result as any)?.usage;
  if (!usage) return { inputTokens: 0, outputTokens: 0 };

  return {
    inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokenCount ?? 0),
    outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokenCount ?? 0),
  };
}

function estimateCost(task: AITask, inputTokens: number, outputTokens: number): number {
  // Qwen-Plus pricing (approx): Input ¥0.0005/1k, Output ¥0.002/1k
  // Qwen-Long pricing (approx): Input ¥0.0005/1k, Output ¥0.002/1k
  const inRate = 0.0000005;
  const outRate = 0.000002;
  return Number((inputTokens * inRate + outputTokens * outRate).toFixed(6));
}

async function logTaskExecution(payload: {
  task: AITask;
  providerPrimary: string;
  providerActual: string;
  fallbackTriggered: boolean;
  latencyMs: number;
  tokenUsageIn: number;
  tokenUsageOut: number;
  costEstimate: number;
  success: boolean;
  errorClass?: string;
}) {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(aiTaskExecutions).values({
      taskType: payload.task,
      providerPrimary: payload.providerPrimary as any,
      providerActual: payload.providerActual as any,
      fallbackTriggered: payload.fallbackTriggered,
      latencyMs: payload.latencyMs,
      tokenUsageIn: payload.tokenUsageIn,
      tokenUsageOut: payload.tokenUsageOut,
      costEstimate: String(payload.costEstimate),
      success: payload.success,
      errorClass: payload.errorClass || null,
    });
  } catch (error) {
    console.error("[AI Gateway] Failed to log task execution", error);
  }
}

/**
 * Invoke OpenAI-compatible chat completions API.
 * 
 * For qwen-long-latest model, the messages format is:
 *   - 1st system message: role definition
 *   - 2nd system message: fileid://xxx references (for document content)
 *   - user message: the actual question/prompt
 * 
 * For other models (qwen-plus), standard messages format is used.
 * 
 * IMPORTANT: Per DashScope docs, do NOT specify max_tokens when using
 * structured output (response_format with json_schema), as it may cause
 * incomplete JSON output or API errors.
 */
async function invokeOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  params: InvokeParams
): Promise<InvokeResult> {
  // Extract response_format from params (supports both camelCase and snake_case)
  const responseFormat = (params as any).responseFormat || (params as any).response_format;
  const hasStructuredOutput = responseFormat?.type === "json_schema" || responseFormat?.type === "json_object";
  // Build request body
  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
  };

  // Add response_format if present
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  // Per DashScope docs: "Do not specify max_tokens when you enable structured output"
  // Also skip max_tokens for json_object mode to avoid truncating JSON output
  if (!hasStructuredOutput) {
    body.max_tokens = (params as any).maxTokens || (params as any).max_tokens || 4096;
  }

  // Add temperature if specified
  if ((params as any).temperature !== undefined) {
    body.temperature = (params as any).temperature;
  }

  console.log(`[AI Gateway] Invoking ${model} with${hasStructuredOutput ? "" : "out"} structured output`);

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI Gateway] API error ${response.status}:`, errorText);
    throw new Error(`Provider call failed: ${response.status} - ${errorText}`);
  }
  return (await response.json()) as InvokeResult;
}

export async function executeTaskLLM(task: AITask, params: InvokeParams): Promise<InvokeResult> {
  const startedAt = Date.now();
  
  // Unified Configuration
  const apiKey = resolveEnvKey("DASHSCOPE_API_KEY");
  if (!apiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY environment variable");
  }

  // Automatic Model Selection
  // vendor_bill_parse: uses qwen-long-latest for document understanding (PDF, Excel, images)
  //   - Files are uploaded via DashScope Files API and referenced via fileid:// in system messages
  //   - Supports structured output (json_schema) via response_format
  //   - 10M token context window, ideal for large vendor bills
  //   - MUST use "qwen-long-latest" (not "qwen-long") per DashScope docs for JSON Schema support
  // All other tasks: use standard text model qwen-plus
  const model = task === "vendor_bill_parse" ? "qwen-long-latest" : "qwen-plus";
  
  // Use Alibaba Cloud compatible-mode endpoint
  const baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";

  console.log(`[AI Gateway] Task: ${task}, Model: ${model}`);

  try {
    const result = await invokeOpenAICompatible(baseUrl, apiKey, model, params);
    const usage = extractTokenUsage(result);
    
    await logTaskExecution({
      task,
      providerPrimary: "qwen",
      providerActual: "qwen",
      fallbackTriggered: false,
      latencyMs: Date.now() - startedAt,
      tokenUsageIn: usage.inputTokens,
      tokenUsageOut: usage.outputTokens,
      costEstimate: estimateCost(task, usage.inputTokens, usage.outputTokens),
      success: true,
    });
    
    return result;
  } catch (error: any) {
    await logTaskExecution({
      task,
      providerPrimary: "qwen",
      providerActual: "qwen",
      fallbackTriggered: false,
      latencyMs: Date.now() - startedAt,
      tokenUsageIn: 0,
      tokenUsageOut: 0,
      costEstimate: 0,
      success: false,
      errorClass: error?.name || "Error",
    });
    throw error;
  }
}

/**
 * Upload a file to DashScope for AI processing via OpenAI-compatible Files API.
 * Returns the file ID (e.g. "file-fe-xxx...")
 * 
 * Qwen-Long uses the OpenAI-compatible file upload endpoint:
 *   POST https://dashscope.aliyuncs.com/compatible-mode/v1/files
 * 
 * The returned file_id can be referenced in system messages as:
 *   fileid://<file_id>
 * 
 * Supported formats: TXT, DOCX, PDF, XLSX, EPUB, MOBI, MD, CSV, JSON, BMP, PNG, JPG/JPEG, GIF
 * File size limits: Images ≤ 20MB, Others ≤ 150MB
 */
export async function uploadFileToDashScope(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = resolveEnvKey("DASHSCOPE_API_KEY");
  if (!apiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY environment variable");
  }

  const formData = new FormData();
  // Create a Blob from the buffer
  const blob = new Blob([new Uint8Array(buffer)]);
  formData.append("file", blob, filename);
  formData.append("purpose", "file-extract");

  try {
    // Use OpenAI-compatible file upload endpoint (works with both qwen-long and qwen-vl)
    const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Note: Do NOT set Content-Type header manually when using FormData,
        // the browser/runtime will set it with the boundary.
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DashScope upload failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;
    // OpenAI-compatible endpoint returns: { id: "file-xxx", object: "file", ... }
    // Legacy DashScope endpoint returns: { data: { uploaded_files: [...] } }
    const fileId = data?.id
      || data?.data?.uploaded_files?.[0]?.file_id
      || data?.output?.id;
    if (!fileId) {
      throw new Error(`DashScope upload returned unexpected format: ${JSON.stringify(data)}`);
    }
    return fileId;
  } catch (error) {
    console.error("[AI Gateway] File upload failed", error);
    throw error;
  }
}
