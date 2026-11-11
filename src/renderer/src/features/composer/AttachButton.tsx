// 输入框工具行里的「添加图片」快捷按钮：除粘贴与拖入外，支持一键唤起系统文件选择器添加多张图片。
import { useRef, type ChangeEvent, type MouseEvent } from "react";
import { useT } from "../../i18n/use-t.ts";
import { Plus } from "../../icons.tsx";

export function AttachButton({
  addFiles,
  acceptsImages,
  disabled = false,
}: {
  addFiles(files: Iterable<File>): Promise<void>;
  acceptsImages?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blocked = disabled || acceptsImages === false;
  const label = acceptsImages === false ? t("composer.attach.unsupported") : t("composer.attachImage");

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) void addFiles(files);
    e.currentTarget.value = "";
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden tabIndex={-1} onChange={onPick} />
      <button
        type="button"
        className="ui-chip composer-attach-btn"
        data-testid="composer-attach"
        disabled={blocked}
        aria-label={label}
        title={label}
        onMouseDown={(e: MouseEvent) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <Plus size={14} />
      </button>
    </>
  );
}
