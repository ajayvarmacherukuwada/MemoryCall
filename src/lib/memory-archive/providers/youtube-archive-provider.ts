import type { ArchiveProvider } from "@/lib/memory-archive/providers/archive-provider";
import { ArchiveProviderError } from "@/lib/memory-archive/providers/archive-provider";
import { GOOGLE_WEB_SCOPES } from "@/lib/google-scopes";
import type {
  GoogleResponseDebug,
  MemoryArchiveProviderState,
  MemoryArchiveUploadRequest,
  MemoryArchiveUploadResponse,
} from "@/lib/memory-archive/types";

const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

function buildResumableMetadata(file: File, title: string, description: string, createdAt: string) {
  return {
    snippet: {
      title,
      description,
      categoryId: "22",
    },
    status: {
      privacyStatus: "private" as const,
      selfDeclaredMadeForKids: false,
    },
    recordingDetails: {
      recordingDate: createdAt,
    },
    fileType: file.type || "video/mp4",
  };
}

async function readBodyDetails(response: Response) {
  const bodyRaw = await response.text();
  let bodyJson: unknown = null;

  try {
    bodyJson = bodyRaw ? JSON.parse(bodyRaw) : null;
  } catch {
    bodyJson = null;
  }

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { bodyRaw, bodyJson, headers };
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const details = await readBodyDetails(response);
  return { response, ...details };
}

function extractGoogleErrorMessage(bodyJson: unknown, bodyRaw: string, fallback: string) {
  if (bodyJson && typeof bodyJson === "object" && "error" in bodyJson) {
    const error = (bodyJson as { error?: { message?: string; errors?: Array<{ message?: string; reason?: string }> } }).error;
    const nested = error?.errors?.[0]?.message ?? error?.message;
    if (nested) return nested;
  }

  if (bodyRaw.trim()) return bodyRaw;
  return fallback;
}

function buildDebug({
  endpoint,
  uploadType,
  privacyStatus,
  requestedScope,
  status,
  statusText,
  responseHeaders,
  responseBodyRaw,
  responseBodyJson,
  requestParts,
  requestMetadata,
}: GoogleResponseDebug & { status?: number; statusText?: string; responseHeaders?: Record<string, string>; responseBodyRaw?: string; responseBodyJson?: unknown }) {
  return {
    endpoint,
    uploadType,
    privacyStatus,
    requestedScope,
    status,
    statusText,
    responseHeaders,
    responseBodyRaw,
    responseBodyJson,
    requestParts,
    requestMetadata,
  } satisfies GoogleResponseDebug;
}

export class YouTubeArchiveProvider implements ArchiveProvider {
  async upload(
    input: MemoryArchiveUploadRequest,
    context: { accessToken: string; signal?: AbortSignal },
  ): Promise<MemoryArchiveUploadResponse> {
    const archiveId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const title = input.title.trim() || input.file.name;
    const description = input.description.trim() || "Private memory archive";
    const requestMetadata = buildResumableMetadata(input.file, title, description, createdAt);
    const baseDebug = {
      endpoint: YOUTUBE_UPLOAD_URL,
      uploadType: "resumable" as const,
      privacyStatus: "private" as const,
      requestedScope: GOOGLE_WEB_SCOPES.archiveAccess,
      requestParts: "snippet,status,recordingDetails",
      requestMetadata,
    };

    const tokenInfo = await fetchJson(`${TOKENINFO_URL}?access_token=${encodeURIComponent(context.accessToken)}`, {
      method: "GET",
      signal: context.signal,
    });

    if (!tokenInfo.response.ok) {
      throw new ArchiveProviderError(
        "tokeninfo_failed",
        extractGoogleErrorMessage(tokenInfo.bodyJson, tokenInfo.bodyRaw, "Unable to verify the OAuth token scope."),
        tokenInfo.response.status,
        buildDebug({
          ...baseDebug,
          status: tokenInfo.response.status,
          statusText: tokenInfo.response.statusText,
          responseHeaders: tokenInfo.headers,
          responseBodyRaw: tokenInfo.bodyRaw,
          responseBodyJson: tokenInfo.bodyJson,
        }),
      );
    }

    const tokenInfoJson = tokenInfo.bodyJson as { scope?: string } | null;
    const tokenScopes = (tokenInfoJson?.scope ?? "").split(/\s+/).filter(Boolean);
    const requiredScopes = [GOOGLE_WEB_SCOPES.archiveUpload, GOOGLE_WEB_SCOPES.archiveRead];
    const missingScopes = requiredScopes.filter((requiredScope) => !tokenScopes.includes(requiredScope));
    if (missingScopes.length) {
      throw new ArchiveProviderError(
        "missing_scope",
        `The access token is missing required archive scopes: ${missingScopes.join(", ")}.`,
        403,
        buildDebug({
          ...baseDebug,
          status: tokenInfo.response.status,
          statusText: tokenInfo.response.statusText,
          responseHeaders: tokenInfo.headers,
          responseBodyRaw: tokenInfo.bodyRaw,
          responseBodyJson: tokenInfo.bodyJson,
        }),
      );
    }

    const channelCheck = await fetchJson(YOUTUBE_CHANNELS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${context.accessToken}` },
      signal: context.signal,
    });

    if (!channelCheck.response.ok) {
      throw new ArchiveProviderError(
        "channel_check_failed",
        extractGoogleErrorMessage(channelCheck.bodyJson, channelCheck.bodyRaw, "Unable to verify the account's channel."),
        channelCheck.response.status,
        buildDebug({
          ...baseDebug,
          endpoint: YOUTUBE_CHANNELS_URL,
          status: channelCheck.response.status,
          statusText: channelCheck.response.statusText,
          responseHeaders: channelCheck.headers,
          responseBodyRaw: channelCheck.bodyRaw,
          responseBodyJson: channelCheck.bodyJson,
        }),
      );
    }

    const channelBody = channelCheck.bodyJson as { items?: Array<{ id?: string }> } | null;
    if (!channelBody?.items?.length) {
      throw new ArchiveProviderError(
        "no_channel",
        "The authenticated Google account does not currently own a YouTube channel.",
        404,
        buildDebug({
          ...baseDebug,
          endpoint: YOUTUBE_CHANNELS_URL,
          status: channelCheck.response.status,
          statusText: channelCheck.response.statusText,
          responseHeaders: channelCheck.headers,
          responseBodyRaw: channelCheck.bodyRaw,
          responseBodyJson: channelCheck.bodyJson,
        }),
      );
    }

    const initResponse = await fetchJson(`${YOUTUBE_UPLOAD_URL}?part=snippet,status,recordingDetails&uploadType=resumable`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.file.type || "video/mp4",
        "X-Upload-Content-Length": String(input.file.size),
      },
      body: JSON.stringify({
        snippet: requestMetadata.snippet,
        status: requestMetadata.status,
        recordingDetails: requestMetadata.recordingDetails,
      }),
      signal: context.signal,
    });

    if (!initResponse.response.ok) {
      throw new ArchiveProviderError(
        "upload_init_failed",
        extractGoogleErrorMessage(initResponse.bodyJson, initResponse.bodyRaw, "The upload session could not be created."),
        initResponse.response.status,
        buildDebug({
          ...baseDebug,
          status: initResponse.response.status,
          statusText: initResponse.response.statusText,
          responseHeaders: initResponse.headers,
          responseBodyRaw: initResponse.bodyRaw,
          responseBodyJson: initResponse.bodyJson,
        }),
      );
    }

    const resumableUrl = initResponse.headers.location ?? initResponse.headers.Location;
    if (!resumableUrl) {
      throw new ArchiveProviderError(
        "missing_resumable_location",
        "The upload session did not return a resumable location.",
        500,
        buildDebug({
          ...baseDebug,
          status: initResponse.response.status,
          statusText: initResponse.response.statusText,
          responseHeaders: initResponse.headers,
          responseBodyRaw: initResponse.bodyRaw,
          responseBodyJson: initResponse.bodyJson,
        }),
      );
    }

    const uploadResponse = await fetchJson(resumableUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": input.file.type || "video/mp4",
      },
      body: input.file,
      signal: context.signal,
    });

    if (!uploadResponse.response.ok) {
      throw new ArchiveProviderError(
        "upload_failed",
        extractGoogleErrorMessage(uploadResponse.bodyJson, uploadResponse.bodyRaw, "The archive provider rejected the upload."),
        uploadResponse.response.status,
        buildDebug({
          ...baseDebug,
          status: uploadResponse.response.status,
          statusText: uploadResponse.response.statusText,
          responseHeaders: uploadResponse.headers,
          responseBodyRaw: uploadResponse.bodyRaw,
          responseBodyJson: uploadResponse.bodyJson,
        }),
      );
    }

    const payload = uploadResponse.bodyJson as {
      id?: string;
      snippet?: { thumbnails?: { default?: { url?: string }; high?: { url?: string } } };
    };

    if (!payload.id) {
      throw new ArchiveProviderError(
        "invalid_response",
        "The archive provider did not return a valid item id.",
        500,
        buildDebug({
          ...baseDebug,
          status: uploadResponse.response.status,
          statusText: uploadResponse.response.statusText,
          responseHeaders: uploadResponse.headers,
          responseBodyRaw: uploadResponse.bodyRaw,
          responseBodyJson: uploadResponse.bodyJson,
        }),
      );
    }

    const thumbnailUrl = payload.snippet?.thumbnails?.high?.url ?? payload.snippet?.thumbnails?.default?.url ?? null;
    const archiveUrl = `https://www.youtube.com/watch?v=${payload.id}`;

    return {
      archive: {
        id: archiveId,
        archiveId,
        title,
        description,
        collection: input.collection,
        createdAt,
        duration: input.duration,
        thumbnailUrl,
        status: "archived",
        progress: 100,
        errorMessage: null,
      },
      providerState: {
        archiveId,
        providerId: payload.id,
        archiveUrl,
        playbackUrl: archiveUrl,
        thumbnailUrl,
        createdAt,
      },
    };
  }
}
