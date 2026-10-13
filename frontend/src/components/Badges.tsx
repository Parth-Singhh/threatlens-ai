import type { IncidentPriority } from "../types";
import { PRIORITIES } from "../types";
import { titleCase } from "../lib";

export function PriorityBadge({ priority, long }: { priority: IncidentPriority; long?: boolean }) {
  const meta = PRIORITIES.find((p) => p.value === priority);
  return (
    <span className="badge pri" data-p={priority}>
      <i />
      {priority.toUpperCase()}
      {long && meta ? ` · ${meta.label}` : ""}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="badge sta" data-s={status}>
      <i />
      {titleCase(status)}
    </span>
  );
}
