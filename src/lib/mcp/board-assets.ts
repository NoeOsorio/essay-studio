import { AssetRecordType, DEFAULT_MAX_ASSET_SIZE, FileHelpers, getAssetInfo, type Editor, type TLAsset, type TLAssetId } from "tldraw";
import { MAX_REQUEST_BYTES, ToolError, type JsonObject } from "../../../shared/mcp";
import { matches, page, textRange } from "./collections";
import { prepareSvgImage } from "./svg-image";

type Upload = {
  editor: Editor; essayId: string; revision: string; type: "image" | "video";
  assetId: TLAssetId;
  mimeType: string; fileName: string; total: number; received: number;
  chunks: Uint8Array<ArrayBuffer>[]; prepared?: TLAsset; preparing?: Promise<void>;
};
const uploads = new Map<string, Upload>();
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "video/mp4", "video/webm"]);
let epoch = 0;

/** Revocation cannot be undone by an async file decoder finishing later. */
export function resetBoardUploads(): void { epoch++; uploads.clear(); }

function readOnly(editor: Editor): void {
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
}
function https(value: unknown, empty = false): string {
  if (empty && value === "") return "";
  if (typeof value !== "string") throw new ToolError("INVALID_ASSET", "Asset URLs require HTTPS.");
  let url: URL;
  try { url = new URL(value); } catch { throw new ToolError("INVALID_ASSET", "Asset URLs require HTTPS."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new ToolError("INVALID_ASSET", "Asset URLs require HTTPS without credentials.");
  return value;
}
function validateNative(editor: Editor, value: TLAsset): void {
  try { editor.store.schema.types.asset.validate(value); }
  catch { throw new ToolError("INVALID_ASSET", "The native asset schema rejected these properties."); }
}
function asset(editor: Editor, id: unknown): TLAsset {
  const value = editor.getAsset(id as TLAssetId);
  if (!value) throw new ToolError("ASSET_NOT_FOUND", "This asset is not in the board document.");
  return value;
}
function upload(editor: Editor, args: JsonObject): Upload {
  const entry = uploads.get(args.uploadId as string);
  if (!entry || entry.editor !== editor || entry.essayId !== args.essayId) throw new ToolError("UPLOAD_NOT_FOUND", "The upload expired or belongs to another board.");
  if (args.operation !== "cancel" && entry.revision !== args.revision) throw new ToolError("STALE_UPLOAD", "The essay changed during the upload. Cancel it and begin again.");
  return entry;
}

export function newRemoteAsset(editor: Editor, args: JsonObject): TLAsset {
  readOnly(editor);
  const type = args.type as TLAsset["type"];
  const props = args.props as Record<string, unknown> | undefined ?? {};
  if (Object.hasOwn(props, "src")) throw new ToolError("INVALID_ASSET", "Provide the source URL in src.");
  const src = https(args.src);
  let value: TLAsset;
  if (type === "image" || type === "video") {
    if (typeof props.w !== "number" || props.w <= 0 || typeof props.h !== "number" || props.h <= 0) throw new ToolError("INVALID_ASSET", "Image and video assets require positive w and h dimensions.");
    value = { id: AssetRecordType.createId(), typeName: "asset", type, props: { name: "", mimeType: null, isAnimated: type === "video", ...props, src }, meta: {} } as TLAsset;
  } else if (type === "bookmark") {
    for (const key of ["image", "favicon"]) if (props[key] !== undefined) https(props[key], true);
    value = { id: AssetRecordType.createId(), typeName: "asset", type, props: { title: "", description: "", image: "", favicon: "", ...props, src }, meta: {} } as TLAsset;
  } else throw new ToolError("INVALID_ASSET", "Choose an image, video or bookmark asset.");
  validateNative(editor, value);
  return value;
}

function decode(value: unknown): Uint8Array<ArrayBuffer> {
  // A chunk remains well below the existing frame even after JSON encoding.
  if (typeof value !== "string" || !value.length || value.length > MAX_REQUEST_BYTES / 2 || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new ToolError("INVALID_UPLOAD", "Provide a nonempty base64 chunk of at most 1 MiB encoded text.");
  let binary: string;
  try { binary = atob(value); } catch { throw new ToolError("INVALID_UPLOAD", "The base64 chunk is invalid."); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function verifySignature(bytes: Uint8Array, mime: string): void {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (from: number, text: string) => [...text].every((character, index) => bytes[from + index] === character.charCodeAt(0));
  const valid = mime === "image/png" ? starts(137, 80, 78, 71, 13, 10, 26, 10)
    : mime === "image/jpeg" ? starts(255, 216, 255)
    : mime === "image/gif" ? ascii(0, "GIF87a") || ascii(0, "GIF89a")
    : mime === "image/webp" ? ascii(0, "RIFF") && ascii(8, "WEBP")
    : mime === "video/mp4" ? ascii(4, "ftyp")
    : mime === "video/webm" ? starts(26, 69, 223, 163) : false;
  if (!valid) throw new ToolError("INVALID_ASSET", "The file signature does not match its declared image or video type.");
}

/** Use native file metadata decoding and inline storage without invoking a
 * configurable remote upload service. No asset enters the live store yet. */
export async function prepareBoardAsset(editor: Editor, args: JsonObject): Promise<void> {
  if (args.operation !== "finish") return;
  readOnly(editor);
  const entry = upload(editor, args);
  if (entry.received !== entry.total) throw new ToolError("INCOMPLETE_UPLOAD", "Send every byte before finishing the upload.");
  if (entry.prepared) return;
  if (entry.preparing) return entry.preparing;
  const startEpoch = epoch;
  entry.preparing = (async () => {
    let file = new File(entry.chunks, entry.fileName, { type: entry.mimeType });
    if (entry.mimeType === "image/svg+xml") file = await prepareSvgImage(file, editor.options.maxShapesPerPage);
    else verifySignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()), entry.mimeType);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let value: TLAsset | undefined;
    try {
      // Match the renderer request deadline; malformed media cannot hold the
      // editor command queue indefinitely while waiting for a metadata event.
      const decodeFile = Promise.all([getAssetInfo(editor, file, entry.assetId), FileHelpers.blobToDataUrl(file)]).then(([value, src]) => value ? { ...value, props: { ...value.props, src } } as TLAsset : undefined);
      value = await Promise.race([decodeFile, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ToolError("UPLOAD_TIMEOUT", "Native file preparation exceeded the request deadline.")), 20_000);
      })]);
    } finally { clearTimeout(timer); }
    if (startEpoch !== epoch || uploads.get(args.uploadId as string) !== entry) throw new ToolError("UPLOAD_NOT_FOUND", "The upload was cancelled or disconnected during preparation.");
    if (!value || value.type !== entry.type) throw new ToolError("INVALID_ASSET", "The native file decoder could not read this asset type.");
    validateNative(editor, value);
    // Do not persist temporary blob URLs that would break after reopening.
    if (typeof value.props.src !== "string" || !value.props.src.startsWith(`data:${entry.mimeType}`)) throw new ToolError("INVALID_ASSET", "The native file handler did not return a durable inline asset.");
    entry.prepared = value;
  })();
  try { await entry.preparing; }
  finally { entry.preparing = undefined; }
}

export function validateAssetTool(editor: Editor, name: string, args: JsonObject): void {
  if (name === "create_asset") newRemoteAsset(editor, args);
  if (name === "import_board_asset" && args.operation === "finish") {
    readOnly(editor);
    const entry = upload(editor, args);
    if (!entry.prepared) throw new ToolError("UPLOAD_NOT_READY", "The upload must be prepared before it is committed.");
    validateNative(editor, entry.prepared);
  }
  if (name === "delete_asset") {
    readOnly(editor);
    const value = asset(editor, args.id);
    if (editor.store.allRecords().some((record) => record.typeName === "shape" && (record.props as Record<string, unknown>).assetId === value.id)) throw new ToolError("ASSET_IN_USE", "Remove or change every shape using this asset before deleting it.");
  }
}

export function handleAssetTool(editor: Editor, name: string, args: JsonObject, transaction: (name: string, fn: () => void) => void): unknown {
  if (name === "list_assets") {
    const assets = editor.getAssets().filter((value) => {
      const props = value.props as Record<string, unknown>;
      const src = value.props.src ?? "";
      return (!args.type || value.type === args.type) && matches(args.query,
        typeof props.name === "string" ? props.name : undefined,
        typeof props.title === "string" ? props.title : undefined,
        typeof props.description === "string" ? props.description : undefined,
        src.startsWith("data:") ? undefined : src);
    }).sort((a, b) => a.id.localeCompare(b.id));
    const result = page(assets, args);
    return { ...result, items: result.items.map((value) => {
      const props = value.props as Record<string, unknown>;
      const src = value.props.src ?? "";
      return { id: value.id, type: value.type, inline: src.startsWith("data:"), sourceLength: src.length,
        ...(typeof props.name === "string" ? { name: props.name.slice(0, 240) } : {}),
        ...(typeof props.title === "string" ? { title: props.title.slice(0, 240) } : {}),
        ...(typeof props.w === "number" ? { width: props.w } : {}),
        ...(typeof props.h === "number" ? { height: props.h } : {}),
        ...(typeof props.mimeType === "string" ? { mimeType: props.mimeType } : {}) };
    }) };
  }
  if (name === "get_asset") {
    const value = asset(editor, args.id);
    const src = value.props.src ?? "";
    const inline = src.startsWith("data:");
    const { src: _src, ...props } = value.props;
    void _src;
    const fields = args.fields as string[] | undefined;
    if (fields?.some((field) => !["props", "data", "meta"].includes(field))) throw new ToolError("INVALID_ARGUMENTS", "Asset fields are props, data and meta.");
    return { id: value.id, type: value.type, inline, sourceLength: src.length,
      ...(!fields || fields.includes("props") ? { props: { ...props, ...(!inline ? { src } : {}) } } : {}),
      ...(fields?.includes("meta") ? { meta: value.meta } : {}),
      ...(fields?.includes("data") ? { data: textRange(src, args) } : {}) };
  }
  if (name === "create_asset") {
    const value = newRemoteAsset(editor, args);
    transaction("create-asset", () => editor.createAssets([value]));
    return { assetId: value.id, changed: true };
  }
  if (name === "delete_asset") {
    validateAssetTool(editor, name, args);
    transaction("delete-asset", () => editor.deleteAssets([args.id as TLAssetId]));
    return { assetId: args.id, deleted: true };
  }
  if (name !== "import_board_asset") throw new ToolError("UNKNOWN_TOOL", "Unknown asset operation.");
  if (args.operation === "begin") {
    readOnly(editor);
    const type = args.type as "image" | "video";
    const mimeType = args.mimeType as string;
    const fileName = args.fileName as string;
    const total = args.totalBytes as number;
    if ((type !== "image" && type !== "video") || !MIME_TYPES.has(mimeType) || !mimeType.startsWith(`${type}/`) || !editor.getAssetUtilForMimeType(mimeType)) throw new ToolError("INVALID_UPLOAD", "Provide PNG, JPEG, GIF, WebP, SVG, MP4 or WebM content with its matching MIME type.");
    if (typeof fileName !== "string" || !fileName || /[\u0000/\\]/u.test(fileName)) throw new ToolError("INVALID_UPLOAD", "Provide a filename without a path.");
    if (!Number.isSafeInteger(total) || total < 1 || total > DEFAULT_MAX_ASSET_SIZE) throw new ToolError("INVALID_UPLOAD", "The file exceeds the native 10 MiB asset limit.");
    if (mimeType === "image/svg+xml" && total > MAX_REQUEST_BYTES) throw new ToolError("INVALID_UPLOAD", "SVG XML exceeds the 2 MiB content limit.");
    if ([...uploads.values()].reduce((sum, item) => sum + item.total, 0) + total > DEFAULT_MAX_ASSET_SIZE) throw new ToolError("UPLOAD_CAPACITY", "Finish or cancel pending uploads before starting another file.");
    const id = crypto.randomUUID();
    const assetId = AssetRecordType.createId();
    uploads.set(id, { editor, essayId: args.essayId as string, revision: args.revision as string, assetId, type, mimeType, fileName, total, received: 0, chunks: [] });
    return { uploadId: id, assetId, receivedBytes: 0, totalBytes: total };
  }
  const entry = upload(editor, args);
  if (args.operation === "cancel") { uploads.delete(args.uploadId as string); return { cancelled: true }; }
  if (args.operation === "append") {
    readOnly(editor);
    if (entry.preparing || entry.prepared) throw new ToolError("UPLOAD_NOT_WRITABLE", "This upload is already being prepared.");
    const bytes = decode(args.data);
    if (args.offset !== entry.received || entry.received + bytes.length > entry.total) throw new ToolError("INVALID_UPLOAD_OFFSET", "Append chunks at the returned decoded-byte offset without exceeding totalBytes.");
    entry.chunks.push(bytes); entry.received += bytes.length;
    return { uploadId: args.uploadId, receivedBytes: entry.received, totalBytes: entry.total };
  }
  if (args.operation !== "finish") throw new ToolError("INVALID_ARGUMENTS", "Choose begin, append, finish or cancel.");
  validateAssetTool(editor, name, args);
  const value = entry.prepared!;
  const existing = editor.getAsset(value.id);
  if (!existing) transaction("import-asset", () => editor.createAssets([value]));
  uploads.delete(args.uploadId as string);
  return { assetId: value.id, changed: !existing, type: value.type };
}
