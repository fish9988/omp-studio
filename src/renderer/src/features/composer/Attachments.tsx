// 输入框顶部的附件卡片：图片 = 缩略图（点击放大预览 Lightbox）+ `#N` + 像素尺寸；
// 文件 = 文件图标 + `#N` + 名字 + 大小；大段粘贴文本 = 文本文件卡片（点击预览全文）+ `#N` + 行数/字节数；右上移除。
// `#N` 是所有附件共用的显示编号（displayNumber，图片在前、文件接着、粘贴文本在后），和文字里的芯片对应；删掉卡片 = 删掉文字里的占位符。
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n/use-t.ts";
import { Close, FileIcon } from "../../icons.tsx";
import { currentLocale } from "../../store/settings-store.ts";
import { displayNumber, formatFileSize, type DraftFile, type DraftImage, type TokenKind } from "./composer-tokens.ts";
import { imageSrc } from "./image-resize.ts";

const EMPTY_PASTES: Readonly<Record<number, string>> = {};

interface AttachmentsProps {
  images: readonly DraftImage[];
  files: readonly DraftFile[];
  pastes?: Readonly<Record<number, string>>;
  onRemove(kind: TokenKind, n: number): void;
}

export function Attachments({ images, files, pastes = EMPTY_PASTES, onRemove }: AttachmentsProps) {
  const t = useT();
  const zh = currentLocale() === "zh-CN";
  const [previewImageIdx, setPreviewImageIdx] = useState<number | null>(null);
  const [previewPasteKey, setPreviewPasteKey] = useState<number | null>(null);

  const pasteEntries = Object.entries(pastes)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);

  useEffect(() => {
    if (previewImageIdx === null && previewPasteKey === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPreviewImageIdx(null);
        setPreviewPasteKey(null);
      } else if (previewImageIdx !== null && images.length > 1) {
        if (event.key === "ArrowLeft") {
          setPreviewImageIdx((i) => (i === null ? null : (i - 1 + images.length) % images.length));
        } else if (event.key === "ArrowRight") {
          setPreviewImageIdx((i) => (i === null ? null : (i + 1) % images.length));
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [previewImageIdx, previewPasteKey, images.length]);

  if (images.length === 0 && files.length === 0 && pasteEntries.length === 0) return null;

  const remove = (kind: TokenKind, n: number) => (
    <button
      type="button"
      className="attachment-remove"
      data-testid="attachment-remove"
      aria-label={t("composer.attachment.remove")}
      title={t("composer.attachment.remove")}
      onClick={(event) => {
        event.stopPropagation();
        onRemove(kind, n);
      }}
    >
      <Close size={12} />
    </button>
  );

  const activeImage = previewImageIdx !== null ? images[previewImageIdx] : undefined;
  const activePaste = previewPasteKey !== null ? pastes[previewPasteKey] : undefined;

  return (
    <>
      <ul className="attachments" data-testid="attachments">
        {images.map((image, index) => {
          const n = index + 1;
          const size =
            image.width !== undefined && image.height !== undefined ? `${image.width}×${image.height}` : null;
          return (
            <li
              key={`image:${n}`}
              className="attachment is-clickable"
              data-testid="attachment"
              data-kind="image"
              data-n={n}
              role="button"
              tabIndex={0}
              title={zh ? "点击放大预览图片" : "Click to preview image"}
              onClick={() => setPreviewImageIdx(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPreviewImageIdx(index);
                }
              }}
            >
              <img className="attachment-thumb" src={imageSrc(image)} alt={t("conversation.imageAlt")} />
              <span className="attachment-text">
                <span className="attachment-n">#{n}</span>
                {size !== null && <span className="attachment-size">{size}</span>}
              </span>
              {remove("image", n)}
            </li>
          );
        })}
        {files.map((file, index) => {
          const n = index + 1;
          const shown = displayNumber({ images, files, pastes }, "file", n);
          return (
            <li key={`file:${n}`} className="attachment" data-testid="attachment" data-kind="file" data-n={n}>
              <span className="attachment-thumb attachment-file-icon" aria-hidden="true">
                <FileIcon size={16} />
              </span>
              <span className="attachment-text">
                <span className="attachment-n">
                  #{shown} <span className="attachment-name">{file.name}</span>
                </span>
                <span className="attachment-size">{formatFileSize(file.size)}</span>
              </span>
              {remove("file", n)}
            </li>
          );
        })}
        {pasteEntries.map(([n, content]) => {
          const shown = displayNumber({ images, files, pastes }, "paste", n);
          const lineCount = content.split("\n").length;
          const firstLine =
            content
              .split("\n")
              .map((l) => l.trim())
              .find((l) => l.length > 0) ?? (zh ? "粘贴文本.txt" : "pasted-text.txt");
          const shortTitle = firstLine.length > 18 ? `${firstLine.slice(0, 17)}…` : firstLine;
          const meta =
            lineCount > 1
              ? zh
                ? `${lineCount} 行 · ${content.length} 字符`
                : `${lineCount} lines · ${content.length} chars`
              : zh
                ? `${content.length} 字符`
                : `${content.length} chars`;
          return (
            <li
              key={`paste:${n}`}
              className="attachment is-clickable"
              data-testid="attachment-paste"
              data-kind="paste"
              data-n={n}
              role="button"
              tabIndex={0}
              title={zh ? "点击预览长文本附件内容" : "Click to preview pasted text"}
              onClick={() => setPreviewPasteKey(n)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPreviewPasteKey(n);
                }
              }}
            >
              <span className="attachment-thumb attachment-file-icon attachment-paste-badge" aria-hidden="true">
                TXT
              </span>
              <span className="attachment-text">
                <span className="attachment-n">
                  #{shown} <span className="attachment-name">{shortTitle}</span>
                </span>
                <span className="attachment-size">{meta}</span>
              </span>
              {remove("paste", n)}
            </li>
          );
        })}
      </ul>
      {activeImage !== undefined &&
        previewImageIdx !== null &&
        createPortal(
          <div
            className="tsp-zoom"
            data-testid="composer-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={t("conversation.imageAlt")}
            onClick={() => setPreviewImageIdx(null)}
          >
            <img
              data-testid="composer-lightbox-image"
              src={imageSrc(activeImage)}
              alt={t("conversation.imageAlt")}
              onClick={(event) => event.stopPropagation()}
            />
            <button
              type="button"
              className="tsp-zoom-close"
              aria-label={t("common.close")}
              onClick={() => setPreviewImageIdx(null)}
              data-testid="composer-lightbox-close"
            >
              <Close size={16} />
            </button>
          </div>,
          document.body,
        )}
      {activePaste !== undefined &&
        previewPasteKey !== null &&
        createPortal(
          <div
            className="tsp-zoom"
            data-testid="composer-paste-modal"
            role="dialog"
            aria-modal="true"
            aria-label={zh ? "粘贴文本预览" : "Pasted text preview"}
            onClick={() => setPreviewPasteKey(null)}
          >
            <div className="composer-paste-modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="composer-paste-modal-head">
                <span className="composer-paste-modal-title">
                  #{displayNumber({ images, files, pastes }, "paste", previewPasteKey)}{" "}
                  {zh ? "长文本附件预览" : "Pasted Text Attachment"} (
                  {zh
                    ? `${activePaste.split("\n").length} 行 · ${activePaste.length} 字符`
                    : `${activePaste.split("\n").length} lines · ${activePaste.length} chars`}
                  )
                </span>
                <button
                  type="button"
                  className="composer-paste-modal-close"
                  aria-label={t("common.close")}
                  onClick={() => setPreviewPasteKey(null)}
                  data-testid="composer-paste-modal-close"
                >
                  <Close size={14} />
                </button>
              </div>
              <pre className="composer-paste-modal-body">{activePaste}</pre>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
