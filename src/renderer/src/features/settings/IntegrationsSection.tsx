// 设置 → 集成与插件：顶部快速筛选（全部 / 插件与市场 / MCP / Skills / SSH）+ 范围下拉（用户 / 项目），集中管理所有扩展能力。
import { useEffect, useId, useState } from "react";
import { useT } from "../../i18n/use-t.ts";
import { Segmented } from "../../ui/controls.tsx";
import { useProjects } from "../sidebar/projects-store.ts";
import { McpCard } from "./McpCard.tsx";
import { PageHeadActions } from "./PageHeadActions.tsx";
import { PluginsSection } from "./PluginsSection.tsx";
import { scopeProject, setCardScope, useCardScope } from "./integrations-store.ts";
import { ScopePicker } from "./ScopePicker.tsx";
import { SkillsCard } from "./SkillsCard.tsx";
import { SshCard } from "./SshCard.tsx";

type HubFilter = "all" | "plugins" | "mcp" | "skills" | "ssh";

export function IntegrationsSection() {
  const t = useT();
  const scope = useCardScope("integrations");
  const [filter, setFilter] = useState<HubFilter>("all");
  const labelId = useId();
  const projects = useProjects();
  const known = scope === "user" || projects.some((project) => project.id === scope);
  useEffect(() => {
    if (!known) setCardScope("integrations", "user");
  }, [known]);

  const filterOptions = [
    { value: "all" as const, label: t("common.all") },
    { value: "plugins" as const, label: t("plugins.installed") },
    { value: "mcp" as const, label: "MCP" },
    { value: "skills" as const, label: "Skills" },
    { value: "ssh" as const, label: "SSH" },
  ];

  return (
    <>
      <PageHeadActions>
        <Segmented<HubFilter>
          size="sm"
          value={filter}
          options={filterOptions}
          label={t("settings.extensions")}
          onChange={setFilter}
          testId="integrations-filter"
        />
        <span id={labelId} className="ig-scope-label">
          {t("integrations.field.scope")}
        </span>
        <ScopePicker
          value={scope}
          includeUser
          size="sm"
          labelledBy={labelId}
          onChange={(next) => setCardScope("integrations", next)}
          testId="integrations-scope-picker"
        />
      </PageHeadActions>
      {(filter === "all" || filter === "plugins") && <PluginsSection projectId={scopeProject(scope)} />}
      {(filter === "all" || filter === "mcp") && <McpCard scope={scope} />}
      {(filter === "all" || filter === "skills") && <SkillsCard scope={scope} />}
      {(filter === "all" || filter === "ssh") && <SshCard scope={scope} />}
    </>
  );
}
